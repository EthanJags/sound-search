/**
 * Compute and store z-score normalization stats from all embeddings in the DB.
 *
 * Run this after ingesting new sounds to keep normalization stats current.
 * The search API reads these stats to normalize query vectors at search time.
 *
 * Usage: npx tsx --env-file=.env.local scripts/compute-norm-stats.ts
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Computing normalization stats from all embeddings...\n");

  // Fetch all embeddings
  const rows = await sql`SELECT embedding FROM sounds WHERE embedding IS NOT NULL`;
  console.log(`  Found ${rows.length} embeddings.`);

  if (rows.length === 0) {
    console.log("  No embeddings found. Nothing to compute.");
    return;
  }

  // Parse embeddings — pgvector returns them as strings like "[1.2,3.4,...]"
  const vectors: number[][] = rows.map((r) => {
    if (typeof r.embedding === "string") return JSON.parse(r.embedding);
    return r.embedding as number[];
  });

  const dim = vectors[0].length;
  const n = vectors.length;

  console.log(`  Dimension: ${dim}, Count: ${n}`);

  // Compute mean
  const statsSum = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) statsSum[i] += vec[i];
  }
  const statsMean = statsSum.map((s) => s / n);

  // Compute std
  const varianceSum = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      const diff = vec[i] - statsMean[i];
      varianceSum[i] += diff * diff;
    }
  }
  const statsStd = varianceSum.map((v) => Math.sqrt(v / n));

  // Store
  const normStats = JSON.stringify({ mean: statsMean, std: statsStd });

  await sql`
    CREATE TABLE IF NOT EXISTS norm_stats (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO norm_stats (key, value, updated_at)
    VALUES ('features', ${normStats}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;

  console.log("\n  Normalization stats saved to norm_stats table.");
  console.log(`  Mean range: [${Math.min(...statsMean).toFixed(4)}, ${Math.max(...statsMean).toFixed(4)}]`);
  console.log(`  Std range:  [${Math.min(...statsStd).toFixed(4)}, ${Math.max(...statsStd).toFixed(4)}]`);
  console.log("\nDone.");
}

main().catch(console.error);
