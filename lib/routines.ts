import sql from "@/lib/db";

/**
 * Routines — the manager's recurring rituals with the coordinators
 * (weekly summary, Tuesday team meeting, ...). Each routine spawns
 * occurrences (one per due date) that get a status and documentation.
 *
 * Schema is self-provisioned: the same idempotent DDL lives in
 * supabase/migration-001.sql, but no DB console was available when this
 * shipped, so the first request creates the tables (CREATE TABLE IF NOT
 * EXISTS — safe to race, additive only) and seeds the two starting routines.
 */

export type Frequency = "daily" | "weekly" | "monthly";
export type LinkedType = "weekly_report" | "meeting" | null;
export type OccurrenceStatus = "planned" | "done" | "missed" | "postponed";

export interface Routine {
  id: number;
  name: string;
  description: string;
  frequency: Frequency;
  weekday: number | null;
  day_of_month: number | null;
  time: string | null;
  participants: number[];
  agenda_template: string;
  requires_doc: boolean;
  linked_type: LinkedType;
  active: boolean;
  created_at: string;
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS routines (
    id serial PRIMARY KEY,
    name text NOT NULL,
    description text DEFAULT '',
    frequency text NOT NULL DEFAULT 'weekly',
    weekday int,
    day_of_month int,
    time text,
    participants int[] DEFAULT '{}',
    agenda_template text DEFAULT '',
    requires_doc boolean DEFAULT false,
    linked_type text,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS routine_occurrences (
    id serial PRIMARY KEY,
    routine_id int REFERENCES routines(id) ON DELETE CASCADE,
    due_date date NOT NULL,
    status text NOT NULL DEFAULT 'planned',
    done_at timestamptz,
    notes text DEFAULT '',
    tasks_created int[] DEFAULT '{}',
    attendees int[] DEFAULT '{}',
    meeting_id int,
    created_at timestamptz DEFAULT now(),
    UNIQUE (routine_id, due_date)
  )`,
  `CREATE INDEX IF NOT EXISTS routine_occurrences_due_idx ON routine_occurrences(due_date)`,
];

let ensured = 0;
const TTL_MS = 10 * 60_000;

export async function ensureRoutinesSchema(): Promise<void> {
  if (Date.now() - ensured < TTL_MS) return;
  try {
    for (const stmt of DDL) await sql.query(stmt);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM routines`;
    if (n === 0) {
      await sql`
        INSERT INTO routines (name, description, frequency, weekday, time, agenda_template, requires_doc, linked_type)
        VALUES
          ('סיכום שבועי', 'כל רכז מגיש דיווח שבועי במערכת עד יום ראשון', 'weekly', 0, '12:00',
           '', false, 'weekly_report'),
          ('פגישה שבועית עם הרכזים', 'פגישת צוות שבועית — סדר יום, סיכום ומשימות', 'weekly', 2, '10:00',
           E'1. סבב עדכונים — מה קרה השבוע\\n2. לידים ויעדים\\n3. אירועים קרובים\\n4. חסמים ובקשות\\n5. משימות לשבוע הבא',
           true, 'meeting')`;
    }
    ensured = Date.now();
  } catch (e) {
    console.error("[routines] ensure schema failed", e);
  }
}

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function parseDate(s: string) { return new Date(s + "T00:00:00Z"); }

/** All due dates of a routine inside [from, to] (inclusive, YYYY-MM-DD). */
export function dueDatesInRange(r: Pick<Routine, "frequency" | "weekday" | "day_of_month" | "created_at">, from: string, to: string): string[] {
  const out: string[] = [];
  const start = parseDate(from), end = parseDate(to);
  if (end < start) return out;
  const created = r.created_at ? ymd(new Date(r.created_at)) : from;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const s = ymd(d);
    if (s < created) continue;
    if (r.frequency === "daily") { if (d.getUTCDay() !== 5 && d.getUTCDay() !== 6) out.push(s); }
    else if (r.frequency === "weekly") { if (d.getUTCDay() === (r.weekday ?? 0)) out.push(s); }
    else if (r.frequency === "monthly") {
      const dom = r.day_of_month ?? 1;
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      if (d.getUTCDate() === Math.min(dom, last)) out.push(s);
    }
  }
  return out;
}

/** Creates any missing occurrences for active routines in range; returns nothing. */
export async function materializeOccurrences(from: string, to: string): Promise<void> {
  const routines = await sql`SELECT id, frequency, weekday, day_of_month, created_at FROM routines WHERE active = true`;
  for (const r of routines as any[]) {
    for (const due of dueDatesInRange(r, from, to)) {
      await sql`INSERT INTO routine_occurrences (routine_id, due_date) VALUES (${r.id}, ${due}) ON CONFLICT (routine_id, due_date) DO NOTHING`;
    }
  }
}

/**
 * For a weekly_report-linked occurrence: the report week is Monday..Sunday
 * ending on the due date (weekly_reports.week_start is a Monday). Returns
 * who submitted and who is missing among the participants.
 */
export async function weeklyReportStatus(dueDate: string, participants: number[]) {
  const due = parseDate(dueDate);
  const dow = due.getUTCDay(); // 0 = Sunday
  const monday = addDays(due, dow === 0 ? -6 : 1 - dow);
  const weekStart = ymd(monday);
  const coords = participants.length
    ? await sql`SELECT id, name FROM coordinators WHERE id = ANY(${participants}) ORDER BY name`
    : await sql`SELECT id, name FROM coordinators ORDER BY name`;
  const submitted = await sql`SELECT coordinator_id, submitted_at FROM weekly_reports WHERE week_start = ${weekStart}`;
  const subMap = new Map((submitted as any[]).map(s => [s.coordinator_id, s.submitted_at]));
  const rows = (coords as any[]).map(c => ({ id: c.id, name: c.name, submitted: subMap.has(c.id), submitted_at: subMap.get(c.id) || null }));
  return {
    week_start: weekStart,
    submitted: rows.filter(r => r.submitted),
    missing: rows.filter(r => !r.submitted),
    all_submitted: rows.length > 0 && rows.every(r => r.submitted),
  };
}
