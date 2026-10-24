import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import sql from "@/lib/db";
import { MEDIA_CHUNK } from "./group-utils";

/**
 * Photos/videos attached to scheduled WhatsApp messages. Uploaded in 2MB parts
 * (Netlify caps request bodies) into a Netlify Blobs store, then served whole
 * from /api/wa-media/<id> so Green API can fetch it at send time (sendFileByUrl).
 * The id is a random UUID — the URL itself is the only access key.
 */

const storeName = () => `netivim-wa-media-${process.env.CONTEXT === "production" ? "production" : (process.env.DEPLOY_ID || "local").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 60)}`;
export const mediaStore = (name = storeName()) => getStore({ name, consistency: "strong" });
export const isUuid = (v: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);

let ensured = false;
export async function ensureMediaTable() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS wa_media (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    mime text NOT NULL,
    size int NOT NULL,
    parts int NOT NULL,
    parts_done int[] NOT NULL DEFAULT '{}',
    ready boolean NOT NULL DEFAULT false,
    store_name text NOT NULL,
    created_by bigint,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  ensured = true;
}

export async function createMedia(spec: { name: string; mime: string; size: number; parts: number }, userId: number) {
  await ensureMediaTable();
  const id = randomUUID();
  await sql`INSERT INTO wa_media (id, name, mime, size, parts, store_name, created_by)
    VALUES (${id}::uuid, ${spec.name}, ${spec.mime}, ${spec.size}, ${spec.parts}, ${storeName()}, ${userId})`;
  return { id, parts: spec.parts, chunkSize: MEDIA_CHUNK };
}

export async function getMedia(id: string) {
  if (!isUuid(id)) return null;
  await ensureMediaTable();
  const [m] = await sql`SELECT * FROM wa_media WHERE id = ${id}::uuid`;
  return m || null;
}

export async function putPart(id: string, part: number, data: ArrayBuffer): Promise<string | null> {
  const m = await getMedia(id);
  if (!m) return "הקובץ לא נמצא";
  if (m.ready) return null;
  if (!Number.isInteger(part) || part < 0 || part >= m.parts) return "מקטע לא תקין";
  const expected = part === m.parts - 1 ? m.size - part * MEDIA_CHUNK : MEDIA_CHUNK;
  if (data.byteLength !== expected) return "גודל המקטע לא תואם";
  await mediaStore(m.store_name).set(`${id}/${part}`, data);
  await sql`UPDATE wa_media SET parts_done = array(SELECT DISTINCT unnest(parts_done || ${[part]}::int[]) ORDER BY 1) WHERE id = ${id}::uuid`;
  return null;
}

export async function finalizeMedia(id: string): Promise<string | null> {
  const m = await getMedia(id);
  if (!m) return "הקובץ לא נמצא";
  if ((m.parts_done || []).length !== m.parts) return "ההעלאה לא הושלמה";
  await sql`UPDATE wa_media SET ready = true WHERE id = ${id}::uuid`;
  return null;
}

/** Public URL Green API downloads from when the message goes out. */
export function mediaUrl(id: string): string {
  return `${(process.env.NEXTAUTH_URL || "https://netivimportal.org").replace(/\/$/, "")}/api/wa-media/${id}`;
}
