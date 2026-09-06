import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const [doc] = await sql`SELECT * FROM documents_case WHERE id=${Number(docId)} AND case_id=${Number(id)}`;
  if (!doc || !doc.file_data) return NextResponse.json({ error: "not found" }, { status: 404 });

  const bytes = Buffer.from(doc.file_data, "base64");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.file_url)}"`,
    },
  });
}
