/**
 * Ingest music production sounds from Freesound.org API.
 *
 * Downloads audio, extracts MFCC embeddings, uploads to Vercel Blob,
 * and inserts into Neon PostgreSQL.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/ingest-freesound.ts
 *
 * Required env vars:
 *   FREESOUND_API_KEY    — Get one at https://freesound.org/apiv2/apply/
 *   DATABASE_URL         — Neon Postgres connection string
 *   BLOB_READ_WRITE_TOKEN — Vercel Blob token
 *
 * Optional env vars:
 *   FREESOUND_MAX_PER_TAG — Max sounds per tag (default: 150)
 *   FREESOUND_PAGE_SIZE   — Results per API page (default: 50)
 */

import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import Meyda from "meyda";

// @ts-ignore — audio-decode has no types
import decode from "audio-decode";

const sql = neon(process.env.DATABASE_URL!);
const FREESOUND_API_KEY = process.env.FREESOUND_API_KEY!;
const MAX_PER_TAG = parseInt(process.env.FREESOUND_MAX_PER_TAG || "150", 10);
const PAGE_SIZE = parseInt(process.env.FREESOUND_PAGE_SIZE || "50", 10);

if (!FREESOUND_API_KEY) {
  console.error("FREESOUND_API_KEY is required. Get one at https://freesound.org/apiv2/apply/");
  process.exit(1);
}

// Music production–focused search tags grouped by pack name
const SEARCH_TAGS: Record<string, string[]> = {
  "Freesound Drums": [
    "kick drum", "snare drum", "hi-hat", "cymbal crash",
    "drum loop", "drum fill", "tom drum", "clap sample",
    "percussion loop", "808 drum",
  ],
  "Freesound Bass": [
    "bass synth", "sub bass", "bass loop", "bass guitar sample",
    "808 bass", "bass stab",
  ],
  "Freesound Synths": [
    "synth pad", "synth lead", "synth pluck", "synth chord",
    "synth arp", "analog synth", "digital synth",
    "synth stab", "synth texture",
  ],
  "Freesound Keys & Strings": [
    "piano sample", "electric piano", "organ sample",
    "strings sample", "violin sample", "cello sample",
    "harp sample", "guitar riff",
  ],
  "Freesound Vocals": [
    "vocal chop", "vocal sample", "vocal loop",
    "vocal harmony", "vocal ad lib",
  ],
  "Freesound FX & Risers": [
    "riser effect", "impact sound", "transition sweep",
    "noise texture", "reverse cymbal", "downlifter",
  ],
  "Freesound Loops & Beats": [
    "music loop", "beat loop", "hip hop loop",
    "house loop", "techno loop", "funk loop",
    "lo-fi loop", "ambient loop",
  ],
};

const N_MFCC = 13;
const BUFFER_SIZE = 512;
const HOP_SIZE = 256;

// Supported formats in order of preference (OGG is smallest, WAV is most compatible)
const PREFERRED_FORMATS = ["ogg", "wav", "mp3"];

interface FreesoundResult {
  id: number;
  name: string;
  tags: string[];
  duration: number;
  previews: Record<string, string>;
}

interface FreesoundSearchResponse {
  count: number;
  next: string | null;
  results: FreesoundResult[];
}

/** Extract 13-dim MFCC vector from decoded PCM data */
function extractMFCC(channelData: Float32Array, sampleRate: number): number[] {
  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = sampleRate;
  Meyda.numberOfMFCCCoefficients = N_MFCC;

  const frames: number[][] = [];
  for (let i = 0; i + BUFFER_SIZE <= channelData.length; i += HOP_SIZE) {
    const frame = channelData.slice(i, i + BUFFER_SIZE);
    const features = Meyda.extract(["mfcc"], frame);
    if (features && typeof features === "object" && "mfcc" in features && features.mfcc) {
      frames.push(features.mfcc as number[]);
    }
  }

  if (frames.length === 0) {
    throw new Error("Could not extract MFCC features");
  }

  const mean = new Array(N_MFCC).fill(0);
  for (const frame of frames) {
    for (let i = 0; i < N_MFCC; i++) {
      mean[i] += frame[i];
    }
  }
  for (let i = 0; i < N_MFCC; i++) {
    mean[i] /= frames.length;
  }

  return mean;
}

/** Search Freesound for a given query, returning up to maxResults sounds */
async function searchFreesound(query: string, maxResults: number): Promise<FreesoundResult[]> {
  const results: FreesoundResult[] = [];
  let page = 1;

  while (results.length < maxResults) {
    const url = new URL("https://freesound.org/apiv2/search/text/");
    url.searchParams.set("query", query);
    url.searchParams.set("fields", "id,name,tags,duration,previews");
    url.searchParams.set("page_size", String(Math.min(PAGE_SIZE, maxResults - results.length)));
    url.searchParams.set("page", String(page));
    // Filter for reasonable duration (0.1s - 30s, typical for samples)
    url.searchParams.set("filter", "duration:[0.1 TO 30]");
    url.searchParams.set("sort", "downloads_desc");
    url.searchParams.set("token", FREESOUND_API_KEY);

    const response = await fetch(url.toString());
    if (!response.ok) {
      if (response.status === 429) {
        console.log("  Rate limited, waiting 60s...");
        await sleep(60000);
        continue;
      }
      console.error(`  Search failed for "${query}": ${response.status} ${response.statusText}`);
      break;
    }

    const data: FreesoundSearchResponse = await response.json();
    results.push(...data.results);

    if (!data.next || results.length >= maxResults) break;
    page++;
    await sleep(200); // Be polite to the API
  }

  return results.slice(0, maxResults);
}

/** Download a Freesound preview (no auth needed for previews) */
async function downloadPreview(sound: FreesoundResult): Promise<{ buffer: Buffer; format: string } | null> {
  // Freesound previews are available in ogg and mp3
  // Keys like: preview-hq-ogg, preview-hq-mp3, preview-lq-ogg, preview-lq-mp3
  for (const fmt of PREFERRED_FORMATS) {
    const key = `preview-hq-${fmt}`;
    const url = sound.previews?.[key];
    if (!url) continue;

    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const arrayBuffer = await response.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), format: fmt };
    } catch {
      continue;
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if a sound ID already exists in the database */
async function soundExists(id: string): Promise<boolean> {
  const result = await sql`SELECT 1 FROM sounds WHERE id = ${id} LIMIT 1`;
  return result.length > 0;
}

async function main() {
  console.log("=== Freesound Music Production Sounds Ingestion ===\n");

  // Collect all unique sounds across all tags
  const seenIds = new Set<number>();
  const soundQueue: { sound: FreesoundResult; soundPack: string }[] = [];

  for (const [pack, tags] of Object.entries(SEARCH_TAGS)) {
    console.log(`\n--- Searching: ${pack} ---`);

    for (const tag of tags) {
      console.log(`  Searching "${tag}"...`);
      const results = await searchFreesound(tag, MAX_PER_TAG);
      let added = 0;

      for (const sound of results) {
        if (!seenIds.has(sound.id)) {
          seenIds.add(sound.id);
          soundQueue.push({ sound, soundPack: pack });
          added++;
        }
      }

      console.log(`  Found ${results.length} results, ${added} new unique sounds`);
      await sleep(300);
    }
  }

  console.log(`\n=== Total unique sounds to process: ${soundQueue.length} ===\n`);

  let processed = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const { sound, soundPack } of soundQueue) {
    const soundId = `freesound-${sound.id}`;
    processed++;

    // Skip if already in DB
    if (await soundExists(soundId)) {
      skipped++;
      continue;
    }

    try {
      // 1. Download preview audio
      const download = await downloadPreview(sound);
      if (!download) {
        console.log(`  [${processed}/${soundQueue.length}] No preview available for ${sound.name}, skipping`);
        failed++;
        continue;
      }

      // 2. Decode audio to PCM
      let audioBuffer: any;
      try {
        audioBuffer = await decode(download.buffer);
      } catch (decodeErr) {
        console.log(`  [${processed}/${soundQueue.length}] Failed to decode ${sound.name}, skipping`);
        failed++;
        continue;
      }

      const channelData = audioBuffer.getChannelData(0) as Float32Array;
      const sampleRate = audioBuffer.sampleRate as number;

      // 3. Extract MFCC embedding
      let embedding: number[];
      try {
        embedding = extractMFCC(channelData, sampleRate);
      } catch {
        console.log(`  [${processed}/${soundQueue.length}] MFCC extraction failed for ${sound.name}, skipping`);
        failed++;
        continue;
      }

      // 4. Upload to Vercel Blob
      const blobPath = `freesound/${soundPack.replace(/\s+/g, "-").toLowerCase()}/${sound.id}.${download.format}`;
      const contentTypeMap: Record<string, string> = {
        ogg: "audio/ogg",
        mp3: "audio/mpeg",
        wav: "audio/wav",
      };

      const blob = await put(blobPath, download.buffer, {
        access: "public",
        contentType: contentTypeMap[download.format] || "application/octet-stream",
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      // 5. Insert into Neon
      const embeddingStr = `[${embedding.join(",")}]`;
      const metadata = JSON.stringify({
        file_path: blobPath,
        freesound_id: sound.id,
        original_name: sound.name,
        tags: sound.tags.slice(0, 20),
        duration: sound.duration,
        blob_url: blob.url,
      });

      await sql`
        INSERT INTO sounds (id, embedding, file_path, metadata, sound_pack)
        VALUES (${soundId}, ${embeddingStr}::vector, ${blobPath}, ${metadata}::jsonb, ${soundPack})
        ON CONFLICT (id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          file_path = EXCLUDED.file_path,
          metadata = EXCLUDED.metadata,
          sound_pack = EXCLUDED.sound_pack
      `;

      uploaded++;

      if (uploaded % 25 === 0) {
        console.log(`  [${processed}/${soundQueue.length}] Uploaded: ${uploaded} | Skipped: ${skipped} | Failed: ${failed}`);
      }

      // Throttle to avoid rate limits
      await sleep(150);
    } catch (error) {
      failed++;
      console.error(`  [${processed}/${soundQueue.length}] Error processing ${sound.name}:`, error);
    }
  }

  console.log("\n=== Ingestion Complete ===");
  console.log(`  Total processed: ${processed}`);
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  Failed: ${failed}`);

  // Final DB count
  const counts = await sql`
    SELECT sound_pack, COUNT(*) as count
    FROM sounds
    GROUP BY sound_pack
    ORDER BY count DESC
  `;

  console.log("\nSound pack counts:");
  for (const row of counts) {
    console.log(`  ${row.sound_pack}: ${row.count}`);
  }
}

main().catch(console.error);
