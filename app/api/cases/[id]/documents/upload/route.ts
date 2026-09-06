import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { currentUser } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";

// No external object storage is wired into this app yet, so files are
// stored as base64 directly in Postgres (documents_case.file_data).
// Deliberate, pragmatic choice: works today with zero new
// infrastructure, but isn't the right long-term answer for large files
// or a high volume of documents — a real object-storage service
// (Netlify Blobs / S3 / R2) is the eventual upgrade, and needs you to
// pick and provision one first.
const MAX_BYTES = 4 * 1024 * 1024; // 4MB

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = Number(id);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const docType = String(form.get("doc_type") || "");
  if (!file) return NextResponse.json({ error: "לא צורף קובץ" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "קובץ גדול מדי (מקסימום 4MB)" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const me = await currentUser(req);

  const rows = await sql`
    INSERT INTO documents_case (case_id, file_url, doc_type, uploaded_by, file_data, mime_type)
    VALUES (${caseId}, ${file.name}, ${docType || null}, ${me?.name || null}, ${base64}, ${file.type || "application/octet-stream"})
    RETURNING id, case_id, file_url, doc_type, uploaded_by, uploaded_at, mime_type`;

  logAudit({ entityType: "case", entityId: caseId, action: "create", actorName: me?.name, actorEmail: me?.email, summary: `קובץ הועלה לתיק: ${file.name}` });
  return NextResponse.json({ document: rows[0] });
}
