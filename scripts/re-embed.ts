/**
 * Re-embed all audio files from Vercel Blob using Meyda MFCC extraction
 * and upsert the vectors to Pinecone.
 *
 * Usage: npx tsx --env-file=.env.local scripts/re-embed.ts
 *
 * Requires .env.local with:
 *   BLOB_READ_WRITE_TOKEN, PINECONE_API_KEY, PINECONE_INDEX_NAME
 *
 * This script ensures Pinecone vectors are consistent with the
 * client-side Meyda MFCC extraction used in the app.
 *
 * NOTE: This is a placeholder — Meyda requires a browser AudioContext
 * for MFCC extraction. For server-side extraction, you'll need to:
 * 1. Use a library like `audiodecode` to decode audio to PCM
 * 2. Implement MFCC extraction manually or find a Node-compatible lib
 * 3. Or run this in a headless browser environment
 */

import { Pinecone } from "@pinecone-database/pinecone";
import { list } from "@vercel/blob";

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index(process.env.PINECONE_INDEX_NAME || "music-ai");

async function listAllAudioFiles(): Promise<{ pathname: string; url: string }[]> {
  const files: { pathname: string; url: string }[] = [];
  let cursor: string | undefined;

  do {
    const result = await list({
      cursor,
      limit: 1000,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    for (const blob of result.blobs) {
      if (/\.(ogg|wav|mp3)$/i.test(blob.pathname)) {
        files.push({ pathname: blob.pathname, url: blob.url });
      }
    }

    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return files;
}

async function getAudioBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch blob: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// TODO: Implement server-side MFCC extraction
// This function needs a Node.js-compatible audio decoder + MFCC implementation
// Options:
// - Use `node-web-audio-api` for OfflineAudioContext in Node
// - Use `audiodecode` + manual DCT/mel filterbank
// - Use Python subprocess calling librosa (temporary bridge)
async function extractMFCCServerSide(_audioBuffer: Buffer): Promise<number[]> {
  throw new Error(
    "Server-side MFCC extraction not yet implemented. " +
    "See comments in this file for implementation options."
  );
}

async function main() {
  console.log("Listing audio files from Vercel Blob...");
  const files = await listAllAudioFiles();
  console.log(`Found ${files.length} audio files`);

  const batchSize = 100;
  let processed = 0;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const vectors = [];

    for (const file of batch) {
      try {
        const audioBuffer = await getAudioBuffer(file.url);
        const mfcc = await extractMFCCServerSide(audioBuffer);

        vectors.push({
          id: file.pathname,
          values: mfcc,
          metadata: { file_path: file.pathname, blob_url: file.url },
        });

        processed++;
        if (processed % 10 === 0) {
          console.log(`Processed ${processed}/${files.length}`);
        }
      } catch (error) {
        console.error(`Error processing ${file.pathname}:`, error);
      }
    }

    if (vectors.length > 0) {
      await index.upsert({ records: vectors });
      console.log(`Upserted batch of ${vectors.length} vectors`);
    }
  }

  console.log(`Done. Processed ${processed} files.`);
}

main().catch(console.error);
