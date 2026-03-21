import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { normalize, NormStats } from "@/app/lib/normalization";

const BLOB_BASE_URL =
  process.env.BLOB_BASE_URL ||
  "https://6zomzp29tjoe4v5u.public.blob.vercel-storage.com";

function toBlobUrl(filePath: string): string {
  const pathname = filePath.replace(/^\.\//, "");
  const encoded = pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${BLOB_BASE_URL}/${encoded}`;
}

/** Cached norm stats — loaded once per cold start */
let cachedStats: NormStats | null = null;

async function getNormStats(): Promise<NormStats | null> {
  if (cachedStats) return cachedStats;

  try {
    const rows = await sql`
      SELECT value FROM norm_stats WHERE key = 'features' LIMIT 1
    `;
    if (rows.length > 0) {
      cachedStats = rows[0].value as NormStats;
      return cachedStats;
    }
  } catch {
    // Table might not exist yet — proceed without normalization
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vector, sound_pack } = body;

    if (!vector || !Array.isArray(vector)) {
      return NextResponse.json(
        { error: "vector (number[]) is required" },
        { status: 400 }
      );
    }

    // Normalize the query vector if stats are available
    const stats = await getNormStats();
    const searchVector = stats ? normalize(vector, stats) : vector;

    const embeddingStr = `[${searchVector.join(",")}]`;

    let results;
    if (sound_pack) {
      results = await sql`
        SELECT
          id,
          1 - (embedding <=> ${embeddingStr}::vector) as score,
          file_path,
          metadata,
          sound_pack
        FROM sounds
        WHERE sound_pack = ${sound_pack}
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT 100
      `;
    } else {
      results = await sql`
        SELECT
          id,
          1 - (embedding <=> ${embeddingStr}::vector) as score,
          file_path,
          metadata,
          sound_pack
        FROM sounds
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT 100
      `;
    }

    const matches = results.map((row) => {
      const metadata = typeof row.metadata === "object" ? row.metadata : {};
      const audioUrl = metadata.blob_url || toBlobUrl(row.file_path);

      return {
        id: row.id,
        score: Number(row.score),
        audioUrl,
        sound_pack: row.sound_pack || "Unknown",
        metadata: {
          file_path: row.file_path,
          ...metadata,
        },
      };
    });

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
