import sql from "@/lib/db";

/**
 * Some columns are introduced by a migration that may not have been
 * applied yet. Querying one that is missing throws and takes the whole
 * page down, so we check once and adapt instead.
 *
 * Cached with a short TTL rather than for the process's whole lifetime.
 * A serverless instance can stay warm for a long, unpredictable time,
 * and a "column missing" result cached before a migration ran would
 * otherwise keep returning false long after the migration succeeded —
 * with no way to know when, short of a redeploy. A minute is enough to
 * avoid hammering information_schema on every request, short enough
 * that running a migration fixes itself without needing one.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { exists: boolean; at: number }>();

export async function hasColumn(table: string, column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.exists;

  try {
    const rows = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
      LIMIT 1
    `;
    const exists = rows.length > 0;
    cache.set(key, { exists, at: Date.now() });
    return exists;
  } catch {
    // If even this fails, assume absent — the safer default. Still
    // timestamped, so a transient DB hiccup doesn't cause a permanent
    // false either.
    cache.set(key, { exists: false, at: Date.now() });
    return false;
  }
}

/** Clears the cache immediately, e.g. right after running a migration. */
export function resetSchemaCache() {
  cache.clear();
}
