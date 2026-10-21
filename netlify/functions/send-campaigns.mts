import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import { runWorker, type Db } from "../../lib/messaging/core";

/**
 * Messaging-center delivery worker. Every few minutes: releases scheduled
 * campaigns that are due and sends a bounded batch from the durable queue
 * (msg_campaign_recipients). Safe to overlap with a manual run — rows are
 * claimed with FOR UPDATE SKIP LOCKED and each address is unique per
 * campaign. Imports lib/messaging/core relatively (no "@/" aliases), which
 * only depends on the DB client it is handed.
 */
export default async () => {
  if (!process.env.DATABASE_URL) return new Response("no db", { status: 200 });
  const sql = neon(process.env.DATABASE_URL) as unknown as Db;
  try {
    const [t] = await sql`SELECT to_regclass('msg_campaign_recipients') IS NOT NULL AS ok`;
    if (!t?.ok) return new Response(JSON.stringify({ skipped: "migration_pending" }), { headers: { "Content-Type": "application/json" } });
    const log = await runWorker(sql, process.env as Record<string, string | undefined>, { budgetMs: 20000 });
    if (log.claimed || log.released || log.unknown) console.log("[send-campaigns]", JSON.stringify(log));
    return new Response(JSON.stringify(log), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[send-campaigns] failed:", e?.message || e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
