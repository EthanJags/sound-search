/**
 * Upload Ableton audio files from local disk to Vercel Blob,
 * matching filenames to what's stored in Neon DB.
 *
 * Does NOT delete original files.
 *
 * Usage: npx tsx --env-file=.env.local scripts/upload-local-to-blob.ts
 */

import { put, list as blobList } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const sql = neon(process.env.DATABASE_URL!);
const ABLETON_DIR = "/Users/coolg/Music/Ableton/Factory Packs";

async function getDbFilenames(): Promise<string[]> {
  const rows = await sql`SELECT DISTINCT file_path FROM sounds`;
  return rows.map((r: any) => {
    // file_path is like "./inputs/filename.ogg" — extract just the filename
    const fp = r.file_path as string;
    return fp.replace(/^\.\/inputs\//, "");
  });
}

function findLocalFiles(): Map<string, string> {
  // Find all audio files recursively in Ableton directory
  const output = execSync(
    `find "${ABLETON_DIR}" -type f \\( -name "*.ogg" -o -name "*.wav" -o -name "*.aif" -o -name "*.mp3" \\)`,
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
  );

  const fileMap = new Map<string, string>();
  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const filename = path.basename(line);
    // If duplicate filename, prefer the first one found
    if (!fileMap.has(filename)) {
      fileMap.set(filename, line);
    }
  }

  return fileMap;
}

async function getExistingBlobPaths(): Promise<Set<string>> {
  const paths = new Set<string>();
  let cursor: string | undefined;

  do {
    const result = await blobList({
      cursor,
      limit: 1000,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    for (const blob of result.blobs) {
      paths.add(blob.pathname);
    }

    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return paths;
}

function getContentType(filename: string): string {
  if (filename.endsWith(".ogg")) return "audio/ogg";
  if (filename.endsWith(".wav")) return "audio/wav";
  if (filename.endsWith(".mp3")) return "audio/mpeg";
  if (filename.endsWith(".aif") || filename.endsWith(".aiff")) return "audio/aiff";
  return "application/octet-stream";
}

async function main() {
  console.log("Fetching filenames from Neon DB...");
  const dbFilenames = await getDbFilenames();
  console.log(`Found ${dbFilenames.length} files referenced in DB`);

  console.log("Scanning local Ableton directory...");
  const localFiles = findLocalFiles();
  console.log(`Found ${localFiles.size} audio files locally`);

  console.log("Checking existing blobs...");
  const existingBlobs = await getExistingBlobPaths();
  console.log(`Found ${existingBlobs.size} existing blobs`);

  // Match DB filenames to local files
  let matched = 0;
  let notFound = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const missingFiles: string[] = [];

  for (const dbFilename of dbFilenames) {
    const localPath = localFiles.get(dbFilename);

    if (!localPath) {
      notFound++;
      missingFiles.push(dbFilename);
      continue;
    }

    matched++;

    // Use the same path format as stored in DB: inputs/filename
    const blobPathname = `inputs/${dbFilename}`;

    if (existingBlobs.has(blobPathname)) {
      skipped++;
      continue;
    }

    try {
      const fileBuffer = readFileSync(localPath);
      const contentType = getContentType(dbFilename);

      await put(blobPathname, fileBuffer, {
        access: "public",
        contentType,
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      uploaded++;
      if (uploaded % 10 === 0) {
        console.log(`Uploaded ${uploaded} files...`);
      }
    } catch (error) {
      failed++;
      console.error(`Failed to upload ${dbFilename}:`, error);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`DB files:        ${dbFilenames.length}`);
  console.log(`Matched locally: ${matched}`);
  console.log(`Not found:       ${notFound}`);
  console.log(`Uploaded:        ${uploaded}`);
  console.log(`Skipped (exist): ${skipped}`);
  console.log(`Failed:          ${failed}`);

  if (missingFiles.length > 0 && missingFiles.length <= 20) {
    console.log(`\nMissing files:`);
    for (const f of missingFiles) {
      console.log(`  ${f}`);
    }
  } else if (missingFiles.length > 20) {
    console.log(`\nFirst 20 missing files:`);
    for (const f of missingFiles.slice(0, 20)) {
      console.log(`  ${f}`);
    }
  }
}

main().catch(console.error);
