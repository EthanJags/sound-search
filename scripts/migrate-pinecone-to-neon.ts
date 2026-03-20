/**
 * Migrate all vectors from Pinecone to Neon Postgres with pgvector.
 * Creates the sounds table with vector column, enables pgvector extension,
 * and copies all vectors + metadata.
 *
 * Usage: npx tsx --env-file=.env.local scripts/migrate-pinecone-to-neon.ts
 */

import { Pinecone } from "@pinecone-database/pinecone";
import { neon } from "@neondatabase/serverless";

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const indexName = process.env.PINECONE_INDEX_NAME || "music-ai";
const index = pc.index(indexName);

const sql = neon(process.env.DATABASE_URL!);

async function setupDatabase() {
  console.log("Setting up database...");

  // Enable pgvector extension
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  // Create sounds table
  await sql`
    CREATE TABLE IF NOT EXISTS sounds (
      id TEXT PRIMARY KEY,
      embedding vector(13) NOT NULL,
      file_path TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create index for vector similarity search
  await sql`
    CREATE INDEX IF NOT EXISTS sounds_embedding_idx
    ON sounds
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10)
  `;

  console.log("Database setup complete");
}

async function fetchAllPineconeVectors(): Promise<
  { id: string; values: number[]; metadata: Record<string, any> }[]
> {
  console.log("Fetching vectors from Pinecone...");

  // First, get the index stats to understand the data
  const stats = await index.describeIndexStats();
  const totalVectors = stats.totalRecordCount || 0;
  console.log(`Pinecone index has ${totalVectors} vectors`);

  if (totalVectors === 0) {
    return [];
  }

  // List all vector IDs using pagination
  const allIds: string[] = [];
  let paginationToken: string | undefined;

  do {
    const listResult = await index.listPaginated({
      limit: 100,
      paginationToken,
    });

    if (listResult.vectors) {
      for (const v of listResult.vectors) {
        if (v.id) allIds.push(v.id);
      }
    }

    paginationToken = listResult.pagination?.next;
  } while (paginationToken);

  console.log(`Found ${allIds.length} vector IDs`);

  // Fetch vectors in batches of 100
  const allVectors: { id: string; values: number[]; metadata: Record<string, any> }[] = [];
  const batchSize = 100;

  for (let i = 0; i < allIds.length; i += batchSize) {
    const batchIds = allIds.slice(i, i + batchSize);

    const fetchResult = await index.fetch({ ids: batchIds });

    for (const [id, record] of Object.entries(fetchResult.records || {})) {
      if (record && record.values) {
        allVectors.push({
          id,
          values: Array.from(record.values),
          metadata: (record.metadata as Record<string, any>) || {},
        });
      }
    }

    console.log(`Fetched ${Math.min(i + batchSize, allIds.length)}/${allIds.length} vectors`);
  }

  return allVectors;
}

async function insertIntoNeon(
  vectors: { id: string; values: number[]; metadata: Record<string, any> }[]
) {
  console.log(`Inserting ${vectors.length} records into Neon...`);

  let inserted = 0;

  // Insert one at a time to handle conflicts gracefully
  for (const vec of vectors) {
    try {
      const filePath = vec.metadata.file_path || null;
      const embeddingStr = `[${vec.values.join(",")}]`;
      const metadataJson = JSON.stringify(vec.metadata);

      await sql`
        INSERT INTO sounds (id, embedding, file_path, metadata)
        VALUES (${vec.id}, ${embeddingStr}::vector, ${filePath}, ${metadataJson}::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          file_path = EXCLUDED.file_path,
          metadata = EXCLUDED.metadata
      `;

      inserted++;
      if (inserted % 50 === 0) {
        console.log(`Inserted ${inserted}/${vectors.length}`);
      }
    } catch (error) {
      console.error(`Failed to insert ${vec.id}:`, error);
    }
  }

  console.log(`Inserted ${inserted} records`);
}

async function main() {
  await setupDatabase();
  const vectors = await fetchAllPineconeVectors();

  if (vectors.length === 0) {
    console.log("No vectors found in Pinecone. Nothing to migrate.");
    return;
  }

  await insertIntoNeon(vectors);

  // Verify
  const countResult = await sql`SELECT COUNT(*) as count FROM sounds`;
  console.log(`\nVerification: ${countResult[0].count} records in Neon sounds table`);

  // Test a similarity query
  const sampleVector = vectors[0].values;
  const embeddingStr = `[${sampleVector.join(",")}]`;
  const testResult = await sql`
    SELECT id, file_path, 1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM sounds
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT 5
  `;

  console.log("\nTest similarity query (top 5 for first vector):");
  for (const row of testResult) {
    console.log(`  ${row.id}: similarity=${Number(row.similarity).toFixed(4)}, path=${row.file_path}`);
  }

  console.log("\nMigration complete!");
}

main().catch(console.error);
