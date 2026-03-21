/**
 * Ingest music production sounds from Freesound.org API.
 *
 * Downloads audio, extracts 83-dim audio feature embeddings, uploads to Vercel Blob,
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
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const sql = neon(process.env.DATABASE_URL!);

/** Decode any audio format to mono Float32Array PCM using ffmpeg */
function decodeAudioWithFFmpeg(buffer: Buffer, format: string): { channelData: Float32Array; sampleRate: number } {
  const tmp = mkdtempSync(join(tmpdir(), "audio-"));
  const inputPath = join(tmp, `input.${format}`);
  const outputPath = join(tmp, "output.raw");
  const sampleRate = 44100;

  try {
    writeFileSync(inputPath, buffer);
    execSync(
      `ffmpeg -y -i "${inputPath}" -ac 1 -ar ${sampleRate} -f f32le "${outputPath}" 2>/dev/null`
    );
    const rawPcm = readFileSync(outputPath);
    const channelData = new Float32Array(rawPcm.buffer, rawPcm.byteOffset, rawPcm.byteLength / 4);
    return { channelData, sampleRate };
  } finally {
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputPath); } catch {}
    try { unlinkSync(tmp); } catch {}
  }
}
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
const NUM_SEGMENTS = 4;

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

interface FrameFeatures {
  mfcc: number[];
  spectralCentroid: number;
  spectralRolloff: number;
  spectralFlatness: number;
  rms: number;
  zcr: number;
}

/** Extract per-frame features from PCM data */
function extractFrames(channelData: Float32Array, sampleRate: number): FrameFeatures[] {
  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = sampleRate;
  Meyda.numberOfMFCCCoefficients = N_MFCC;

  const frames: FrameFeatures[] = [];
  const featureNames = ["mfcc", "spectralCentroid", "spectralRolloff", "spectralFlatness", "rms", "zcr"];

  for (let i = 0; i + BUFFER_SIZE <= channelData.length; i += HOP_SIZE) {
    const frame = channelData.slice(i, i + BUFFER_SIZE);
    const features = Meyda.extract(featureNames, frame);

    if (features && typeof features === "object" && "mfcc" in features && features.mfcc) {
      frames.push({
        mfcc: features.mfcc as number[],
        spectralCentroid: (features.spectralCentroid as number) || 0,
        spectralRolloff: (features.spectralRolloff as number) || 0,
        spectralFlatness: (features.spectralFlatness as number) || 0,
        rms: (features.rms as number) || 0,
        zcr: (features.zcr as number) || 0,
      });
    }
  }

  return frames;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

function variance(arr: number[], avg: number): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) {
    const diff = v - avg;
    sum += diff * diff;
  }
  return sum / arr.length;
}

/** Extract 83-dim feature vector from decoded PCM data */
function extractFeatures(channelData: Float32Array, sampleRate: number): number[] {
  const frames = extractFrames(channelData, sampleRate);

  if (frames.length === 0) {
    throw new Error("Could not extract audio features");
  }

  const vector: number[] = [];

  // MFCC mean (13)
  const mfccMeans: number[] = [];
  for (let c = 0; c < N_MFCC; c++) {
    const vals = frames.map((f) => f.mfcc[c]);
    mfccMeans.push(mean(vals));
  }
  vector.push(...mfccMeans);

  // MFCC variance (13)
  for (let c = 0; c < N_MFCC; c++) {
    const vals = frames.map((f) => f.mfcc[c]);
    vector.push(variance(vals, mfccMeans[c]));
  }

  // MFCC 4-segment means (52) — temporal envelope
  const segmentSize = Math.floor(frames.length / NUM_SEGMENTS);
  for (let seg = 0; seg < NUM_SEGMENTS; seg++) {
    const start = seg * segmentSize;
    const end = seg === NUM_SEGMENTS - 1 ? frames.length : start + segmentSize;
    const segFrames = frames.slice(start, end);

    for (let c = 0; c < N_MFCC; c++) {
      const vals = segFrames.map((f) => f.mfcc[c]);
      vector.push(mean(vals));
    }
  }

  // Spectral centroid (1)
  vector.push(mean(frames.map((f) => f.spectralCentroid)));
  // Spectral rolloff (1)
  vector.push(mean(frames.map((f) => f.spectralRolloff)));
  // Spectral flatness (1)
  vector.push(mean(frames.map((f) => f.spectralFlatness)));
  // RMS energy (1)
  vector.push(mean(frames.map((f) => f.rms)));
  // Zero crossing rate (1)
  vector.push(mean(frames.map((f) => f.zcr)));

  return vector;
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
  console.log("=== Freesound Music Production Sounds Ingestion (83-dim features) ===\n");

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

      // 2. Decode audio to PCM via ffmpeg
      let channelData: Float32Array;
      let sampleRate: number;
      try {
        const decoded = decodeAudioWithFFmpeg(download.buffer, download.format);
        channelData = decoded.channelData;
        sampleRate = decoded.sampleRate;
      } catch (decodeErr) {
        console.log(`  [${processed}/${soundQueue.length}] Failed to decode ${sound.name}, skipping`);
        failed++;
        continue;
      }

      // 3. Extract 83-dim feature embedding
      let embedding: number[];
      try {
        embedding = extractFeatures(channelData, sampleRate);
      } catch {
        console.log(`  [${processed}/${soundQueue.length}] Feature extraction failed for ${sound.name}, skipping`);
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
