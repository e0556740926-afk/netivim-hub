import { neon } from "@neondatabase/serverless";
import { getStore } from "@netlify/blobs";

/**
 * Background function (up to 15 min): extracts the text of the published
 * "מאגר ידע: מסלולים ומסגרות" PDFs from the knowledge center into
 * bot_knowledge, so the WhatsApp tracks bot answers only from Netivim's own
 * material. Only items whose version changed are re-read. Internal-only
 * material (high schools) is excluded. Triggered from the bot settings
 * screen; authenticated with NEXTAUTH_SECRET.
 *
 * Self-contained (separate esbuild context, no "@/lib/*" imports).
 */
const sql = neon(process.env.DATABASE_URL!);
const EXCLUDED = /תיכונ/;

async function pdfBase64(assetId: string) {
  const [a]: any = await sql`SELECT id, mime, size, parts, store_name FROM knowledge_assets WHERE id = ${assetId}::uuid AND ready`;
  if (!a || a.mime !== "application/pdf" || a.size > 20_000_000) return null;
  const s = getStore({ name: a.store_name, consistency: "strong" });
  const chunks: Buffer[] = [];
  for (let part = 0; part < a.parts; part++) {
    const b = await s.get(`${a.id}/${part}`, { type: "arrayBuffer" });
    if (!b) return null;
    chunks.push(Buffer.from(b as ArrayBuffer));
  }
  return Buffer.concat(chunks).toString("base64");
}

async function extract(data: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5", max_tokens: 12000,
      system: "אתה מעתיק מסמכים. החזר רק את תוכן המסמך, בלי הקדמה ובלי סיכום.",
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
        { type: "text", text: "העתק את כל הטקסט שבמסמך כלשונו בעברית, לפי הסדר. טבלאות – שורה לכל רשומה, עם שמות העמודות. אל תוסיף מידע שאינו במסמך." },
      ] }],
    }),
  });
  const body: any = await res.json().catch(() => null);
  if (!res.ok) { console.error("[bot-knowledge] anthropic", res.status, body?.error?.type); return null; }
  return (body?.content || []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("").trim() || null;
}

export default async (req: Request) => {
  if (req.headers.get("x-netivim-secret") !== process.env.NEXTAUTH_SECRET) return new Response("unauthorized", { status: 401 });
  await sql`CREATE TABLE IF NOT EXISTS bot_knowledge (item_id uuid PRIMARY KEY, title text NOT NULL, body text NOT NULL, source_version integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  const items = ((await sql`SELECT id, title, version, asset_id, pdf_asset_id FROM knowledge_items
    WHERE status = 'published' AND topic LIKE 'מאגר ידע%' ORDER BY title`) as any[]).filter(i => !EXCLUDED.test(i.title));
  const have = new Map(((await sql`SELECT item_id, source_version FROM bot_knowledge`) as any[]).map(r => [String(r.item_id), Number(r.source_version)]));
  for (const it of items) {
    if (have.get(String(it.id)) === Number(it.version)) continue;
    try {
      const data = await pdfBase64(String(it.pdf_asset_id || it.asset_id || ""));
      const text = data ? await extract(data) : null;
      if (!text) { console.error("[bot-knowledge] no text for", it.title); continue; }
      await sql`INSERT INTO bot_knowledge (item_id, title, body, source_version) VALUES (${it.id}::uuid, ${it.title}, ${text}, ${it.version})
        ON CONFLICT (item_id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, source_version = EXCLUDED.source_version, updated_at = now()`;
    } catch (e) { console.error("[bot-knowledge] item failed", it.title, e); }
  }
  const keep = items.map(i => String(i.id));
  await sql`DELETE FROM bot_knowledge WHERE NOT (item_id::text = ANY(${keep}::text[]))`;
  return new Response("ok");
};
