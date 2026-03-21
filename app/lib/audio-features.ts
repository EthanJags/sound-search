"use client";

import Meyda from "meyda";
import type { MeydaAudioFeature } from "meyda";

/**
 * Enhanced audio feature extraction for sound matching.
 *
 * Produces an 83-dimensional feature vector:
 *   [0..12]   MFCC mean          (13) — timbral shape
 *   [13..25]  MFCC variance      (13) — timbral consistency
 *   [26..77]  MFCC 4-segment     (52) — temporal envelope (attack/sustain/decay)
 *   [78]      Spectral centroid   (1)  — brightness
 *   [79]      Spectral rolloff    (1)  — high-frequency energy
 *   [80]      Spectral flatness   (1)  — noisiness vs tonality
 *   [81]      RMS energy          (1)  — loudness
 *   [82]      Zero crossing rate  (1)  — percussive vs tonal
 */

const N_MFCC = 13;
const BUFFER_SIZE = 512;
const HOP_SIZE = 256;
const NUM_SEGMENTS = 4;

export const FEATURE_DIM = N_MFCC * 2 + N_MFCC * NUM_SEGMENTS + 5; // 83

const FEATURES_TO_EXTRACT: MeydaAudioFeature[] = [
  "mfcc",
  "spectralCentroid",
  "spectralRolloff",
  "spectralFlatness",
  "rms",
  "zcr",
];

interface FrameFeatures {
  mfcc: number[];
  spectralCentroid: number;
  spectralRolloff: number;
  spectralFlatness: number;
  rms: number;
  zcr: number;
}

/** Extract per-frame features from PCM channel data */
function extractFrames(
  channelData: Float32Array,
  sampleRate: number
): FrameFeatures[] {
  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = sampleRate;
  Meyda.numberOfMFCCCoefficients = N_MFCC;

  const frames: FrameFeatures[] = [];

  for (let i = 0; i + BUFFER_SIZE <= channelData.length; i += HOP_SIZE) {
    const frame = channelData.slice(i, i + BUFFER_SIZE);
    const features = Meyda.extract(FEATURES_TO_EXTRACT, frame);

    if (
      features &&
      typeof features === "object" &&
      "mfcc" in features &&
      features.mfcc
    ) {
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

/** Compute mean of an array */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

/** Compute variance of an array given its mean */
function variance(arr: number[], avg: number): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) {
    const diff = v - avg;
    sum += diff * diff;
  }
  return sum / arr.length;
}

/**
 * Build the 83-dim feature vector from extracted frames.
 * This is the core logic shared between client-side and server-side extraction.
 */
export function buildFeatureVector(frames: FrameFeatures[]): number[] {
  if (frames.length === 0) {
    throw new Error("No frames to build feature vector from");
  }

  const vector: number[] = [];

  // --- MFCC mean (13 dims) ---
  const mfccMeans: number[] = [];
  for (let c = 0; c < N_MFCC; c++) {
    const vals = frames.map((f) => f.mfcc[c]);
    const m = mean(vals);
    mfccMeans.push(m);
  }
  vector.push(...mfccMeans);

  // --- MFCC variance (13 dims) ---
  for (let c = 0; c < N_MFCC; c++) {
    const vals = frames.map((f) => f.mfcc[c]);
    vector.push(variance(vals, mfccMeans[c]));
  }

  // --- MFCC 4-segment means (52 dims) — temporal envelope ---
  const segmentSize = Math.floor(frames.length / NUM_SEGMENTS);
  for (let seg = 0; seg < NUM_SEGMENTS; seg++) {
    const start = seg * segmentSize;
    // Last segment gets any remaining frames
    const end =
      seg === NUM_SEGMENTS - 1 ? frames.length : start + segmentSize;
    const segFrames = frames.slice(start, end);

    for (let c = 0; c < N_MFCC; c++) {
      const vals = segFrames.map((f) => f.mfcc[c]);
      vector.push(mean(vals));
    }
  }

  // --- Spectral centroid mean (1 dim) ---
  vector.push(mean(frames.map((f) => f.spectralCentroid)));

  // --- Spectral rolloff mean (1 dim) ---
  vector.push(mean(frames.map((f) => f.spectralRolloff)));

  // --- Spectral flatness mean (1 dim) ---
  vector.push(mean(frames.map((f) => f.spectralFlatness)));

  // --- RMS energy mean (1 dim) ---
  vector.push(mean(frames.map((f) => f.rms)));

  // --- Zero crossing rate mean (1 dim) ---
  vector.push(mean(frames.map((f) => f.zcr)));

  return vector;
}

/**
 * Extract an 83-dimensional audio feature vector from an audio Blob.
 * Client-side extraction using Web Audio API + Meyda.
 */
export async function extractFeatures(audioBlob: Blob): Promise<number[]> {
  const arrayBuffer = await audioBlob.arrayBuffer();

  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  const channelData = audioBuffer.getChannelData(0);
  const frames = extractFrames(channelData, audioBuffer.sampleRate);

  if (frames.length === 0) {
    throw new Error("Could not extract audio features");
  }

  return buildFeatureVector(frames);
}

/**
 * Extract features from raw PCM data (for server-side / Node.js usage).
 * Accepts Float32Array channel data and sample rate directly.
 */
export function extractFeaturesFromPCM(
  channelData: Float32Array,
  sampleRate: number
): number[] {
  const frames = extractFrames(channelData, sampleRate);

  if (frames.length === 0) {
    throw new Error("Could not extract audio features from PCM data");
  }

  return buildFeatureVector(frames);
}
