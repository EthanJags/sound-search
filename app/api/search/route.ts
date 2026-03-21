import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

const BLOB_BASE_URL = process.env.BLOB_BASE_URL || "https://6zomzp29tjoe4v5u.public.blob.vercel-storage.com";

function toBlobUrl(filePath: string): string {
  // file_path is like "./inputs/filename.ogg" — strip leading "./"
  const pathname = filePath.replace(/^\.\//, "");
  // URL-encode each path segment while keeping "/"
  const encoded = pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${BLOB_BASE_URL}/${encoded}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vector } = body;

    if (!vector || !Array.isArray(vector)) {
      return NextResponse.json(
        { error: "vector (number[]) is required" },
        { status: 400 }
      );
    }

    const embeddingStr = `[${vector.join(",")}]`;

    const results = await sql`
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

    const matches = results.map((row) => {
      const metadata = typeof row.metadata === "object" ? row.metadata : {};
      // For Freesound sounds, use the blob_url from metadata directly
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
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
