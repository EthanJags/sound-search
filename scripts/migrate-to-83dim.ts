/**
 * Migrate the sounds table from 13-dim MFCC embeddings to 83-dim feature vectors.
 *
 * This script:
 * 1. Adds a new embedding column (vector(83))
 * 2. Re-extracts features for all existing sounds from their blob URLs
 * 3. Drops the old embedding column and renames the new one
 * 4. Creates an HNSW index (better recall than IVFFlat)
 * 5. Creates the norm_stats table for z-score normalization
 * 6. Computes and stores normalization stats
 *
 * Usage: npx tsx --env-file=.env.local scripts/migrate-to-83dim.ts
 */

import { neon } from "@neondatabase/serverless";
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

const N_MFCC = 13;
const BUFFER_SIZE = 512;
const HOP_SIZE = 256;
const NUM_SEGMENTS = 4;

interface FrameFeatures {
  mfcc: number[];
  spectralCentroid: number;
  spectralRolloff: number;
  spectralFlatness: number;
  rms: number;
  zcr: number;
}

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

function extractFeatures(channelData: Float32Array, sampleRate: number): number[] {
  const frames = extractFrames(channelData, sampleRate);

  if (frames.length === 0) {
    throw new Error("Could not extract audio features");
  }

  const vector: number[] = [];

  const mfccMeans: number[] = [];
  for (let c = 0; c < N_MFCC; c++) {
    const vals = frames.map((f) => f.mfcc[c]);
    mfccMeans.push(mean(vals));
  }
  vector.push(...mfccMeans);

  for (let c = 0; c < N_MFCC; c++) {
    const vals = frames.map((f) => f.mfcc[c]);
    vector.push(variance(vals, mfccMeans[c]));
  }

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

  vector.push(mean(frames.map((f) => f.spectralCentroid)));
  vector.push(mean(frames.map((f) => f.spectralRolloff)));
  vector.push(mean(frames.map((f) => f.spectralFlatness)));
  vector.push(mean(frames.map((f) => f.rms)));
  vector.push(mean(frames.map((f) => f.zcr)));

  return vector;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Migration: 13-dim → 83-dim feature embeddings ===\n");

  // Step 1: Schema changes (idempotent)
  console.log("Step 1: Ensuring schema...");

  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  // Create norm_stats table if needed
  await sql`
    CREATE TABLE IF NOT EXISTS norm_stats (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  console.log("  Schema OK.\n");

  // Step 2: Re-extract features for all sounds
  console.log("Step 2: Re-extracting features for existing sounds...");

  const BLOB_BASE_URL = process.env.BLOB_BASE_URL || "https://6zomzp29tjoe4v5u.public.blob.vercel-storage.com";

  function toBlobUrl(filePath: string): string {
    const pathname = filePath.replace(/^\.\//, "");
    const encoded = pathname
      .split("/")
      .map((segment: string) => encodeURIComponent(segment))
      .join("/");
    return `${BLOB_BASE_URL}/${encoded}`;
  }

  const sounds = await sql`
    SELECT id, file_path, metadata FROM sounds WHERE embedding IS NULL
  `;

  console.log(`  Found ${sounds.length} sounds to re-embed.\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const allVectors: number[][] = [];

  for (const sound of sounds) {
    processed++;
    const metadata = typeof sound.metadata === "object" ? sound.metadata : {};
    // Use blob_url from metadata, or construct from file_path
    const audioUrl = metadata.blob_url || (sound.file_path ? toBlobUrl(sound.file_path) : null);

    if (!audioUrl) {
      console.log(`  [${processed}/${sounds.length}] No audio URL for ${sound.id}, skipping`);
      failed++;
      continue;
    }

    try {
      // Download audio
      const response = await fetch(audioUrl);
      if (!response.ok) {
        console.log(`  [${processed}/${sounds.length}] Failed to fetch ${sound.id}: ${response.status}`);
        failed++;
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Detect format from URL
      const urlExt = audioUrl.match(/\.(ogg|mp3|wav|flac|aif|aiff)(\?|$)/i)?.[1] || "ogg";

      // Decode to PCM via ffmpeg
      let channelData: Float32Array;
      let sampleRate: number;
      try {
        const decoded = decodeAudioWithFFmpeg(buffer, urlExt);
        channelData = decoded.channelData;
        sampleRate = decoded.sampleRate;
      } catch {
        console.log(`  [${processed}/${sounds.length}] Failed to decode ${sound.id}`);
        failed++;
        continue;
      }

      // Extract 83-dim features
      const embedding = extractFeatures(channelData, sampleRate);
      allVectors.push(embedding);

      // Update DB
      const embeddingStr = `[${embedding.join(",")}]`;
      await sql`
        UPDATE sounds SET embedding = ${embeddingStr}::vector WHERE id = ${sound.id}
      `;

      succeeded++;

      if (succeeded % 25 === 0) {
        console.log(`  [${processed}/${sounds.length}] OK: ${succeeded} | Failed: ${failed}`);
      }

      // Throttle fetches
      await sleep(50);
    } catch (error) {
      failed++;
      console.error(`  [${processed}/${sounds.length}] Error on ${sound.id}:`, error);
    }
  }

  console.log(`\n  Re-embedding complete: ${succeeded} OK, ${failed} failed.\n`);

  // Step 3: Compute and store normalization stats
  console.log("Step 3: Computing normalization stats...");

  if (allVectors.length > 0) {
    const dim = allVectors[0].length;
    const n = allVectors.length;

    const statsSum = new Array(dim).fill(0);
    for (const vec of allVectors) {
      for (let i = 0; i < dim; i++) statsSum[i] += vec[i];
    }
    const statsMean = statsSum.map((s) => s / n);

    const varianceSum = new Array(dim).fill(0);
    for (const vec of allVectors) {
      for (let i = 0; i < dim; i++) {
        const diff = vec[i] - statsMean[i];
        varianceSum[i] += diff * diff;
      }
    }
    const statsStd = varianceSum.map((v) => Math.sqrt(v / n));

    const normStats = JSON.stringify({ mean: statsMean, std: statsStd });

    await sql`
      INSERT INTO norm_stats (key, value, updated_at)
      VALUES ('features', ${normStats}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;

    console.log(`  Stats computed from ${n} vectors and stored.\n`);

    // Step 3b: Normalize existing embeddings in-place
    console.log("Step 3b: Normalizing stored embeddings...");

    const allSounds = await sql`SELECT id, embedding FROM sounds WHERE embedding IS NOT NULL`;
    let normalized = 0;

    for (const s of allSounds) {
      // embedding_v2 comes back as a string like "[1.2,3.4,...]"
      const raw = typeof s.embedding === "string"
        ? JSON.parse(s.embedding)
        : s.embedding;

      const normVec = (raw as number[]).map((val: number, i: number) => {
        const std = statsStd[i];
        if (std === 0 || Number.isNaN(std)) return 0;
        return (val - statsMean[i]) / std;
      });

      const normStr = `[${normVec.join(",")}]`;
      await sql`UPDATE sounds SET embedding = ${normStr}::vector WHERE id = ${s.id}`;
      normalized++;

      if (normalized % 100 === 0) {
        console.log(`  Normalized ${normalized}/${allSounds.length}`);
      }
    }

    console.log(`  Normalized ${normalized} embeddings.\n`);
  }

  // Step 4: Ensure HNSW index exists
  console.log("Step 4: Ensuring HNSW index...");

  await sql`
    CREATE INDEX IF NOT EXISTS sounds_embedding_hnsw_idx
    ON sounds
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `;

  console.log("  Index OK.\n");

  // Verify
  const count = await sql`SELECT COUNT(*) as count FROM sounds WHERE embedding IS NOT NULL`;
  console.log(`=== Migration complete! ${count[0].count} sounds with 83-dim embeddings ===`);
}

main().catch(console.error);
