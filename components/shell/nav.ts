import { accessLevel, levelAllowsWrite, type ModuleName } from "@/lib/permission-matrix"
import type { QuickType } from "@/lib/quick-action"
import type { IconName } from "./icons"

/**
 * Navigation for the phone shell. Every entry points at a screen that
 * already exists — nothing here grants access. Visibility follows the
 * same permission matrix the API enforces; the server still decides.
 */
export type ShellKind = "coord" | "admin"
export type Tab = { key: string; label: string; path: string; icon: IconName; match: string[] }
export type MenuItem = { label: string; sub: string; path: string; icon: IconName }
export type MenuGroup = { title: string; items: MenuItem[] }
export type QuickAction = { type: QuickType; title: string; sub: string; icon: IconName; path: string }

type U = { id: number; role: string; team?: string | null } | null

const can = (u: U, m: ModuleName) => !!u && accessLevel(u, m) !== "NONE"
const canWrite = (u: U, m: ModuleName) => !!u && u.role !== "viewer" && levelAllowsWrite(accessLevel(u, m))

export function shellKind(role?: string): ShellKind {
  return role === "coordinator" ? "coord" : "admin"
}

export function tabsFor(kind: ShellKind): Tab[] {
  if (kind === "coord") return [
    { key: "home", label: "היום שלי", path: "/coord/home", icon: "home", match: ["/coord/home"] },
    { key: "leads", label: "לידים", path: "/coord/leads", icon: "lead", match: ["/coord/leads"] },
    { key: "tasks", label: "משימות", path: "/coord/tasks", icon: "task", match: ["/coord/tasks"] },
    { key: "contacts", label: "קשרים", path: "/coord/contacts", icon: "people", match: ["/coord/contacts"] },
  ]
  return [
    { key: "home", label: "בית", path: "/admin/dashboard", icon: "home", match: ["/admin/dashboard"] },
    { key: "leads", label: "לידים", path: "/admin/leads", icon: "lead", match: ["/admin/leads"] },
    { key: "tasks", label: "משימות", path: "/admin/tasks", icon: "task", match: ["/admin/tasks"] },
    { key: "contacts", label: "קשרים", path: "/admin/contacts", icon: "people", match: ["/admin/contacts"] },
  ]
}

export function menuFor(kind: ShellKind, u: U): MenuGroup[] {
  if (kind === "coord") return [
    { title: "כלי עבודה", items: [
      { label: "יומן", sub: "סדר יום, חודש וחיבור ליומן", path: "/coord/calendar", icon: "calendar" },
      { label: "אירועים", sub: "המפגשים וההתקדמות שלך", path: "/coord/events", icon: "event" },
      { label: "עמותות ומוסדות", sub: "פרטי ארגונים ואנשי הקשר שלהם", path: "/coord/contacts?view=organizations", icon: "org" },
      { label: "הקישור האישי שלי", sub: "פניות שמגיעות עם השיוך שלך", path: "/coord/link", icon: "link" },
      { label: "ניוזלטר", sub: "התוכן והאפשרויות הקיימות", path: "/coord/newsletter", icon: "mail" },
      { label: "הפרופיל שלי", sub: "פרטים אישיים, דיווח שבועי והעדפות", path: "/coord/profile", icon: "user" },
    ] },
  ]

  const field: MenuItem[] = []
  if (can(u, "leads")) field.push({ label: "לידים", sub: "ניהול הפניות והטיפול בהן", path: "/admin/leads", icon: "lead" })
  if (can(u, "contacts")) {
    field.push({ label: "אנשי קשר ושותפים", sub: "אנשים, עמותות ומוסדות", path: "/admin/contacts", icon: "people" })
    field.push({ label: "עמותות ומוסדות", sub: "המאגר המשותף של הארגונים", path: "/admin/contacts?view=organizations", icon: "org" })
  }
  if (can(u, "events")) field.push({ label: "אירועים", sub: "מעקב ואישור אירועים", path: "/admin/events", icon: "event" })
  if (can(u, "reports")) {
    field.push({ label: "ניהול רכזים", sub: "רכזים, יעדים ודיווחי פעילות", path: "/admin/reports", icon: "team" })
    field.push({ label: "שגרות", sub: "ניהול שגרות העבודה", path: "/admin/routines", icon: "repeat" })
  }
  field.push({ label: "לוח מובילים", sub: "התקדמות צוות השטח", path: "/admin/leaderboard", icon: "trophy" })

  const manage: MenuItem[] = []
  if (can(u, "tasks")) manage.push({ label: "משימות", sub: "הקצאה ומעקב לכל הצוות", path: "/admin/tasks", icon: "task" })
  manage.push({ label: "לוח שנה", sub: "סדר יום ותצוגת חודש", path: "/admin/calendar", icon: "calendar" })
  if (can(u, "newsletters")) {
    manage.push({ label: "ניוזלטר", sub: "ניהול תוכן הניוזלטר", path: "/admin/newsletter", icon: "mail" })
    manage.push({ label: "מרכז דיוורים", sub: "קהלים, ייבוא וקמפיינים", path: "/admin/messaging", icon: "send" })
  }

  const groups: MenuGroup[] = [
    { title: "שטח וקהילה", items: field },
    { title: "ניהול", items: manage },
  ]
  if (u?.role === "admin") groups.push({ title: "הגדרות", items: [
    { label: "משתמשים והרשאות", sub: "ניהול המשתמשים הקיים", path: "/admin/settings", icon: "settings" },
    { label: "בונה שדות", sub: "שדות מותאמים", path: "/admin/settings/fields", icon: "fields" },
    { label: "אוטומציות", sub: "כללי האוטומציה", path: "/admin/settings/automation", icon: "bolt" },
    { label: "מקורות לידים", sub: "מקורות ולינקים", path: "/admin/leaderboard/sources", icon: "link" },
    { label: "ערוצי הגעה", sub: "הערוצים הקיימים", path: "/admin/leaderboard/channels", icon: "route" },
  ] })
  return groups.filter(g => g.items.length)
}

export function quickActionsFor(kind: ShellKind, u: U): QuickAction[] {
  const base = kind === "coord" ? "/coord" : "/admin"
  const out: QuickAction[] = []
  if (canWrite(u, "leads")) out.push({ type: "lead", title: "ליד חדש", sub: "פרטים, מקור ושותף מפנה", icon: "lead", path: `${base}/leads` })
  if (canWrite(u, "tasks")) out.push({ type: "task", title: "משימה חדשה", sub: kind === "coord" ? "מועד, סוג ועדיפות" : "מועד ושיוך לכמה עובדים", icon: "task", path: `${base}/tasks` })
  if (canWrite(u, "contacts")) {
    out.push({ type: "partner", title: "שותף חדש", sub: "בחירה בעמותה או מוסד קיימים", icon: "people", path: `${base}/contacts` })
    out.push({ type: "interaction", title: "תיעוד קשר", sub: "שיחה, פגישה או הודעה", icon: "chat", path: `${base}/contacts` })
    out.push({ type: "organization", title: "עמותה או מוסד", sub: "רשומה משותפת לאנשי הקשר", icon: "org", path: `${base}/contacts` })
  }
  if (canWrite(u, "events")) out.push({ type: "event", title: kind === "coord" ? "הצעת אירוע" : "אירוע חדש", sub: kind === "coord" ? "נשלח לאישור המנהל" : "פתיחת טופס האירוע", icon: "event", path: `${base}/events` })
  if (kind === "coord") out.push({ type: "report", title: "עדכון לדוח", sub: "הדיווח השבועי למנהל", icon: "report", path: "/coord/profile" })
  if (kind === "admin" && u?.role !== "coordinator" && canWrite(u, "newsletters")) {
    out.push({ type: "campaign", title: "קמפיין חדש", sub: "מייל, SMS או וואטסאפ — טיוטה", icon: "send", path: "/admin/messaging/campaigns/new" })
    out.push({ type: "import", title: "ייבוא נמענים", sub: "Excel או CSV לקהל", icon: "report", path: "/admin/messaging/import" })
  }
  if (kind === "admin" && u?.role === "admin") out.push({ type: "user", title: "משתמש חדש", sub: "דרך ניהול המשתמשים הקיים", icon: "user", path: "/admin/settings" })
  return out
}
