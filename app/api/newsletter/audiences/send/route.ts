import { NextResponse } from "next/server";

/**
 * Retired. The old direct sender looped over a client-supplied recipient
 * list inside the request, with no unsubscribe link and no suppression
 * check. All campaign sends now go through /api/messaging (server-side
 * audience snapshot, consent + suppression checks, background worker).
 */
export async function POST() {
  return NextResponse.json(
    { error: "השליחה הזו הועברה למרכז הדיוורים (/admin/messaging). יש ליצור קמפיין ולאשר אותו שם." },
    { status: 410 },
  );
}
