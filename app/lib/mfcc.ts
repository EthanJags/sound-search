"use client";

import Meyda from "meyda";

const N_MFCC = 13;
const BUFFER_SIZE = 512;
const HOP_SIZE = 256;

/**
 * Extract MFCC features from an audio Blob.
 * Replicates the Python pipeline: librosa MFCC extraction → mean across time.
 * Returns a 13-dimensional feature vector.
 */
export async function extractMFCC(audioBlob: Blob): Promise<number[]> {
  const arrayBuffer = await audioBlob.arrayBuffer();

  // Decode the audio using AudioContext
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  const channelData = audioBuffer.getChannelData(0);

  // Configure Meyda globals before extraction
  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = audioBuffer.sampleRate;
  Meyda.numberOfMFCCCoefficients = N_MFCC;

  // Extract MFCC for each frame
  const frames: number[][] = [];

  for (let i = 0; i + BUFFER_SIZE <= channelData.length; i += HOP_SIZE) {
    const frame = channelData.slice(i, i + BUFFER_SIZE);

    // Pass an array to get back {mfcc: number[]}, single string returns raw value
    const features = Meyda.extract(["mfcc"], frame);

    if (features && typeof features === "object" && "mfcc" in features && features.mfcc) {
      frames.push(features.mfcc as number[]);
    }
  }

  if (frames.length === 0) {
    throw new Error("Could not extract MFCC features from audio");
  }

  // Average across all frames (same as np.mean(mfcc.T, axis=0))
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
