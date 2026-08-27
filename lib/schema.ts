import sql from "@/lib/db";

/**
 * Some columns are introduced by a migration that may not have been
 * applied yet. Querying one that is missing throws and takes the whole
 * page down, so we check once per process and adapt instead.
 *
 * Cached for the lifetime of the serverless instance; a redeploy or a
 * cold start re-checks, which is soon enough after a migration.
 */
const cache = new Map<string, boolean>();

export async function hasColumn(table: string, column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const rows = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
      LIMIT 1
    `;
    const exists = rows.length > 0;
    cache.set(key, exists);
    return exists;
  } catch {
    // If even this fails, assume absent — the safer default.
    cache.set(key, false);
    return false;
  }
}

/** Clears the cache, e.g. right after running a migration. */
export function resetSchemaCache() {
  cache.clear();
}
