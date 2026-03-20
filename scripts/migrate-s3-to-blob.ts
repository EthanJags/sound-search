/**
 * Migrate all audio files from AWS S3 to Vercel Blob.
 * Does NOT delete originals from S3.
 *
 * Usage: npx tsx --env-file=.env.local scripts/migrate-s3-to-blob.ts
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { put, list as blobList } from "@vercel/blob";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const bucketName = process.env.S3_BUCKET_NAME || "soundsearch";

async function listS3Files(): Promise<string[]> {
  const files: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      ContinuationToken: continuationToken,
    });
    const response = await s3.send(command);

    for (const obj of response.Contents || []) {
      if (obj.Key) {
        files.push(obj.Key);
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return files;
}

async function getS3Object(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const response = await s3.send(command);
  const bytes = await response.Body!.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: response.ContentType || "application/octet-stream",
  };
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

async function main() {
  console.log("Listing files in S3...");
  const s3Files = await listS3Files();
  console.log(`Found ${s3Files.length} files in S3`);

  console.log("Checking existing blobs...");
  const existingBlobs = await getExistingBlobPaths();
  console.log(`Found ${existingBlobs.size} existing blobs`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const key of s3Files) {
    // Skip if already uploaded
    if (existingBlobs.has(key)) {
      skipped++;
      continue;
    }

    try {
      const { buffer, contentType } = await getS3Object(key);

      await put(key, buffer, {
        access: "public",
        contentType,
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      uploaded++;
      if (uploaded % 10 === 0) {
        console.log(`Uploaded ${uploaded} files (skipped ${skipped}, failed ${failed})`);
      }
    } catch (error) {
      failed++;
      console.error(`Failed to upload ${key}:`, error);
    }
  }

  console.log(`\nDone!`);
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total S3 files: ${s3Files.length}`);
}

main().catch(console.error);
