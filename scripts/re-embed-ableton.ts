/**
 * Re-embed Ableton Standard sounds with raw (un-normalized) 83-dim features.
 * This ensures all sounds are in the same space — normalization happens at query time.
 *
 * Usage: npx tsx --env-file=.env.local scripts/re-embed-ableton.ts
 */

import { neon } from "@neondatabase/serverless";
import Meyda from "meyda";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const sql = neon(process.env.DATABASE_URL!);

const BLOB_BASE_URL = process.env.BLOB_BASE_URL || "https://6zomzp29tjoe4v5u.public.blob.vercel-storage.com";

const N_MFCC = 13;
const BUFFER_SIZE = 512;
const HOP_SIZE = 256;
const NUM_SEGMENTS = 4;

function toBlobUrl(filePath: string): string {
  const pathname = filePath.replace(/^\.\//, "");
  const encoded = pathname
    .split("/")
    .map((segment: string) => encodeURIComponent(segment))
    .join("/");
  return `${BLOB_BASE_URL}/${encoded}`;
}

function decodeAudioWithFFmpeg(buffer: Buffer, format: string): { channelData: Float32Array; sampleRate: number } {
  const tmp = mkdtempSync(join(tmpdir(), "audio-"));
  const inputPath = join(tmp, `input.${format}`);
  const outputPath = join(tmp, "output.raw");
  const sampleRate = 44100;

  try {
    writeFileSync(inputPath, buffer);
    execSync(`ffmpeg -y -i "${inputPath}" -ac 1 -ar ${sampleRate} -f f32le "${outputPath}" 2>/dev/null`);
    const rawPcm = readFileSync(outputPath);
    const channelData = new Float32Array(rawPcm.buffer, rawPcm.byteOffset, rawPcm.byteLength / 4);
    return { channelData, sampleRate };
  } finally {
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputPath); } catch {}
    try { unlinkSync(tmp); } catch {}
  }
}

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
  if (frames.length === 0) throw new Error("Could not extract audio features");

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
  console.log("Re-embedding Ableton Standard sounds with raw features...\n");

  const sounds = await sql`
    SELECT id, file_path FROM sounds WHERE sound_pack = 'Ableton Standard' AND file_path IS NOT NULL
  `;

  console.log(`Found ${sounds.length} Ableton sounds.\n`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < sounds.length; i++) {
    const sound = sounds[i];
    const audioUrl = toBlobUrl(sound.file_path);

    try {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        console.log(`  [${i + 1}/${sounds.length}] Failed to fetch ${sound.id}: ${response.status}`);
        failed++;
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const urlExt = audioUrl.match(/\.(ogg|mp3|wav|flac)(\?|$)/i)?.[1] || "ogg";
      const { channelData, sampleRate } = decodeAudioWithFFmpeg(buffer, urlExt);
      const embedding = extractFeatures(channelData, sampleRate);

      const embeddingStr = `[${embedding.join(",")}]`;
      await sql`UPDATE sounds SET embedding = ${embeddingStr}::vector WHERE id = ${sound.id}`;

      succeeded++;
      if (succeeded % 50 === 0) {
        console.log(`  [${i + 1}/${sounds.length}] OK: ${succeeded} | Failed: ${failed}`);
      }

      await sleep(50);
    } catch (error) {
      failed++;
      console.error(`  [${i + 1}/${sounds.length}] Error on ${sound.id}:`, error);
    }
  }

  console.log(`\nDone: ${succeeded} OK, ${failed} failed.`);

  // Recompute norm stats
  console.log("\nRecomputing normalization stats...");

  const rows = await sql`SELECT embedding FROM sounds WHERE embedding IS NOT NULL`;
  const vectors: number[][] = rows.map((r: any) => {
    if (typeof r.embedding === "string") return JSON.parse(r.embedding);
    return r.embedding;
  });

  const dim = vectors[0].length;
  const n = vectors.length;
  const statsSum = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let j = 0; j < dim; j++) statsSum[j] += vec[j];
  }
  const statsMean = statsSum.map((s: number) => s / n);

  const varianceSum = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let j = 0; j < dim; j++) {
      const diff = vec[j] - statsMean[j];
      varianceSum[j] += diff * diff;
    }
  }
  const statsStd = varianceSum.map((v: number) => Math.sqrt(v / n));

  const normStats = JSON.stringify({ mean: statsMean, std: statsStd });
  await sql`
    INSERT INTO norm_stats (key, value, updated_at)
    VALUES ('features', ${normStats}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;

  console.log(`Norm stats recomputed from ${n} vectors. Done!`);
}

main().catch(console.error);
