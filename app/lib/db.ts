import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

/**
 * Lazily create the Neon client so that importing this module (e.g. during
 * `next build`) doesn't throw when DATABASE_URL isn't set.
 */
function getClient(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    client = neon(url);
  }
  return client;
}

export const sql = ((strings: TemplateStringsArray, ...params: unknown[]) =>
  getClient()(strings, ...params)) as NeonQueryFunction<false, false>;
