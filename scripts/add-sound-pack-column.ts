/**
 * Add sound_pack column to sounds table and label existing sounds as "Ableton Standard".
 *
 * Usage: npx tsx --env-file=.env.local scripts/add-sound-pack-column.ts
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Adding sound_pack column...");

  await sql`
    ALTER TABLE sounds
    ADD COLUMN IF NOT EXISTS sound_pack TEXT DEFAULT 'Unknown'
  `;

  console.log("Column added. Labeling existing sounds as 'Ableton Standard'...");

  const result = await sql`
    UPDATE sounds
    SET sound_pack = 'Ableton Standard'
    WHERE sound_pack IS NULL OR sound_pack = 'Unknown'
  `;

  console.log(`Updated ${result.length ?? 'all'} existing sounds.`);

  // Verify
  const counts = await sql`
    SELECT sound_pack, COUNT(*) as count
    FROM sounds
    GROUP BY sound_pack
  `;

  console.log("\nSound pack counts:");
  for (const row of counts) {
    console.log(`  ${row.sound_pack}: ${row.count}`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
