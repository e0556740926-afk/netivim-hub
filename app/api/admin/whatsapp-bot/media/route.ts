import { NextRequest, NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/auth-server";
import { MEDIA_CHUNK, mediaSpec } from "@/lib/whatsapp-bot/group-utils";
import { createMedia, finalizeMedia, putPart } from "@/lib/whatsapp-bot/media";

/**
 * Upload a photo/video for a scheduled message — admins only.
 * POST {name, size}            → {id, parts, chunkSize}
 * PUT  ?id=<uuid>&part=<n>     → raw bytes of one 2MB part
 * POST {id, finalize: true}    → marks the file ready
 */
async function guard(req: NextRequest) {
  const me = await currentUser(req);
  return me && isAdmin(me) ? me : null;
}

export async function POST(req: NextRequest) {
  const me = await guard(req);
  if (!me) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  const d = await req.json().catch(() => ({}));
  if (d.finalize) {
    const err = await finalizeMedia(String(d.id || ""));
    return err ? NextResponse.json({ error: err }, { status: 400 }) : NextResponse.json({ ok: true });
  }
  const spec = mediaSpec(String(d.name || ""), Number(d.size));
  if (typeof spec === "string") return NextResponse.json({ error: spec }, { status: 400 });
  return NextResponse.json(await createMedia(spec, me.id));
}

export async function PUT(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: "רק למנהל מערכת" }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > MEDIA_CHUNK) return NextResponse.json({ error: "מקטע גדול מדי" }, { status: 413 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const part = Number(req.nextUrl.searchParams.get("part"));
  const err = await putPart(id, part, await req.arrayBuffer());
  return err ? NextResponse.json({ error: err }, { status: 400 }) : NextResponse.json({ ok: true });
}
