import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const coordId = req.nextUrl.searchParams.get("coordinator_id");
  const weekStr = req.nextUrl.searchParams.get("week"); // YYYY-MM-DD (monday)
  if (!coordId) return NextResponse.json({ error: "missing coordinator_id" }, { status: 400 });

  // Calculate week range
  const weekStart = weekStr ? new Date(weekStr) : (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() - 6); // last monday
    return d;
  })();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const ws = weekStart.toISOString().slice(0,10);
  const we = weekEnd.toISOString().slice(0,10);

  const cid = parseInt(coordId);

  const [
    coordRows, leadsRows, interactionsRows,
    tasksRows, reportRows, eventsRows, contactsRows
  ] = await Promise.all([
    sql`SELECT c.*, u.email FROM coordinators c LEFT JOIN users u ON u.id=c.user_id WHERE c.id=${cid}`,
    sql`SELECT * FROM leads WHERE coordinator_id=${cid} AND created_at::date BETWEEN ${ws} AND ${we} ORDER BY created_at`,
    sql`SELECT i.*, c.name as contact_name, c.org as contact_org FROM interactions i
        LEFT JOIN contacts c ON c.id=i.contact_id
        WHERE i.coordinator_id=${cid} AND i.date BETWEEN ${ws} AND ${we} ORDER BY i.date`,
    sql`SELECT * FROM tasks WHERE ${cid}=ANY(
          SELECT id::int FROM coordinators WHERE id=${cid}
        ) OR (SELECT name FROM coordinators WHERE id=${cid})=ANY(assignees)
        ORDER BY due_date`,
    sql`SELECT * FROM weekly_reports WHERE coordinator_id=${cid} AND week_start BETWEEN ${ws} AND ${we} ORDER BY submitted_at DESC LIMIT 1`,
    sql`SELECT * FROM events WHERE coordinator_id=${cid} AND date BETWEEN ${ws} AND ${we} ORDER BY date`,
    sql`SELECT * FROM contacts WHERE coordinator_id=${cid} AND last_contact BETWEEN ${ws} AND ${we} ORDER BY last_contact DESC`,
  ]);

  // Tasks categorized
  const today = new Date().toISOString().slice(0,10);
  const allTasks = tasksRows;
  const tasksDone = allTasks.filter((t:any) => t.status === "done");
  const tasksInProgress = allTasks.filter((t:any) => t.status === "inprogress" || t.status === "waiting");
  const tasksLate = allTasks.filter((t:any) => t.status !== "done" && t.due_date && t.due_date.toISOString().slice(0,10) < today);
  const tasksTodo = allTasks.filter((t:any) => t.status === "todo" && (!t.due_date || t.due_date.toISOString().slice(0,10) >= today));

  // Score
  const leadsScore = Math.min(leadsRows.length * 5, 30);
  const intScore = Math.min(interactionsRows.length * 8, 30);
  const taskScore = tasksDone.length > 0 ? Math.min(tasksDone.length * 5, 20) : 0;
  const reportScore = reportRows.length > 0 ? 20 : 0;
  const totalScore = leadsScore + intScore + taskScore + reportScore;

  return NextResponse.json({
    coordinator: coordRows[0] || null,
    week: { start: ws, end: we },
    leads: leadsRows,
    interactions: interactionsRows,
    tasks: { done: tasksDone, inProgress: tasksInProgress, late: tasksLate, todo: tasksTodo, all: allTasks },
    report: reportRows[0] || null,
    events: eventsRows,
    contacts: contactsRows,
    score: { total: totalScore, leads: leadsScore, interactions: intScore, tasks: taskScore, report: reportScore },
  });
}
