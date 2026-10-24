import { NextRequest } from "next/server";
import { getMedia, mediaStore } from "@/lib/whatsapp-bot/media";

/**
 * Public, read-only: serves a finished scheduled-message attachment so Green
 * API can download it at send time. The random UUID in the path is the key;
 * unfinished or unknown ids get 404. Listed in middleware PUBLIC_API.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await getMedia(id).catch(() => null);
  if (!m || !m.ready) return new Response("Not found", { status: 404 });
  const store = mediaStore(m.store_name);
  let part = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      if (part >= m.parts) { controller.close(); return; }
      const bytes = await store.get(`${id}/${part}`, { type: "arrayBuffer" });
      if (!bytes) { controller.error(new Error("missing part")); return; }
      controller.enqueue(new Uint8Array(bytes));
      part++;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": m.mime,
      "Content-Length": String(m.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(m.name)}`,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
