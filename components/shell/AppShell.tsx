"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { requestQuickAction } from "@/lib/quick-action"
import PushNotificationToggle from "@/components/ui/PushNotificationToggle"
import PersonalLinkPopup from "@/components/admin/PersonalLinkPopup"
import ViewAsControl from "@/components/admin/ViewAsControl"
import GlobalSearch from "@/components/admin/GlobalSearch"
import Sheet from "./Sheet"
import { Icon } from "./icons"
import { menuFor, quickActionsFor, tabsFor, type QuickAction, type ShellKind } from "./nav"
import "./shell.css"

export const ROLE_LABEL: Record<string, string> = {
  admin: "מנהל", ceo: "מנכ״ל", rav: "רב", recruitment_manager: "מנהל גיוס", advisor: "יועץ",
  field_manager: "מנהל שטח", coordinator: "רכז", secretary: "מזכירות", viewer: "צופה",
}
const initials = (n?: string) => (n || "?").split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2)

/** Navy header for the phone layout: logo, avatar and the user's real role. */
export function ShellHeader({ kind, onAvatar }: { kind: ShellKind; onAvatar?: () => void }) {
  const { user } = useAuth()
  const router = useRouter()
  return (
    <header className={`shell-header ${kind === "admin" ? "shell-phone-only" : ""}`} dir="rtl">
      <Image src="/netivim-logo.png" alt="נתיבים" width={104} height={34} className="shell-logo" priority />
      <button type="button" className="shell-identity"
        onClick={() => onAvatar ? onAvatar() : router.push(kind === "coord" ? "/coord/profile" : "/admin/dashboard")}
        aria-label={`${user?.name || ""}, ${ROLE_LABEL[user?.role || ""] || ""} — תפריט אישי`}>
        <span className="shell-avatar">{initials(user?.name)}</span>
        <span className="shell-role">{ROLE_LABEL[user?.role || ""] || user?.role}</span>
      </button>
    </header>
  )
}

/**
 * Bottom navigation, the floating "+ הוספה" button and the two sheets it
 * owns (quick add, "עוד"). For the admin layout this is phone-only — the
 * desktop keeps the sidebar.
 */
export function ShellChrome({ kind, moreOpen, setMoreOpen }: { kind: ShellKind; moreOpen: boolean; setMoreOpen: (v: boolean) => void }) {
  const { user, logout } = useAuth()
  const path = usePathname()
  const router = useRouter()
  const [quickOpen, setQuickOpen] = useState(false)
  const [late, setLate] = useState(0)
  const [q, setQ] = useState("")

  const tabs = tabsFor(kind)
  const menu = useMemo(() => menuFor(kind, user), [kind, user])
  const actions = useMemo(() => quickActionsFor(kind, user), [kind, user])
  const activeTab = tabs.find(t => t.match.some(m => path === m || path.startsWith(m + "/")))?.key || "more"

  useScrollMemory()

  // Overdue badge on the tasks tab — same rule the sidebar uses.
  useEffect(() => {
    if (!user) return
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" })
    const url = kind === "coord" ? `/api/tasks?name=${encodeURIComponent(user.name)}` : "/api/dashboard"
    fetch(url).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      setLate((d.tasks || []).filter((t: any) => t.status !== "done" && t.due_date && String(t.due_date).slice(0, 10) < today).length)
    }).catch(() => {})
  }, [user, kind, path])

  useEffect(() => { if (!moreOpen) setQ("") }, [moreOpen])
  // Any navigation (global search result, a link inside a tool) closes the sheets.
  useEffect(() => { setMoreOpen(false); setQuickOpen(false) }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  function go(href: string) {
    setMoreOpen(false)
    rememberHere()
    router.push(href.includes("?") ? href : lastUrl(href))
  }
  function runAction(a: QuickAction) {
    setQuickOpen(false)
    if (path === a.path) requestQuickAction(a.type)
    else { rememberHere(); router.push(`${a.path}?new=${a.type}`) }
  }

  const needle = q.trim()
  const groups = menu.map(g => ({ ...g, items: g.items.filter(i => !needle || (i.label + " " + i.sub).includes(needle)) })).filter(g => g.items.length)

  return (
    <div className={kind === "admin" ? "shell-phone-only" : ""} dir="rtl">
      {actions.length > 0 && (
        <button type="button" className="shell-fab" onClick={() => setQuickOpen(true)} aria-haspopup="dialog" aria-expanded={quickOpen}>
          <Icon name="plus" size={22} /><span>הוספה</span>
        </button>
      )}

      <nav className="shell-bottom" aria-label="ניווט ראשי">
        <div className="shell-bottom-inner">
          {tabs.map(t => (
            <button key={t.key} type="button" className="shell-tab" aria-current={activeTab === t.key ? "page" : undefined}
              onClick={() => { if (activeTab === t.key && path === t.path) window.scrollTo({ top: 0, behavior: "smooth" }); else { rememberHere(); router.push(lastUrl(t.path)) } }}>
              <span className="shell-tab-icon">
                <Icon name={t.icon} />
                {t.key === "tasks" && late > 0 && <span className="shell-tab-badge" aria-label={`${late} משימות באיחור`}>{late > 99 ? "99+" : late}</span>}
              </span>
              <span>{t.label}</span>
            </button>
          ))}
          <button type="button" className="shell-tab" aria-current={activeTab === "more" ? "page" : undefined} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
            <span className="shell-tab-icon"><Icon name="more" /></span><span>עוד</span>
          </button>
        </div>
      </nav>

      <Sheet open={quickOpen} onClose={() => setQuickOpen(false)} title="מה מוסיפים?" subtitle={`פעולות מהירות ל${ROLE_LABEL[user?.role || ""] || "משתמש"} · זמין מכל מסך`} labelledBy="shell-quick-title">
        <div className="shell-quick-grid">
          {actions.map(a => (
            <button key={a.type} type="button" onClick={() => runAction(a)}>
              <span className="shell-circle"><Icon name={a.icon} /></span>
              <strong>{a.title}</strong>
              <small>{a.sub}</small>
            </button>
          ))}
        </div>
        <p className="shell-note">מוצגות רק פעולות שמותרות לך. הבחירה פותחת את הטופס הקיים במסך המתאים.</p>
      </Sheet>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="עוד אפשרויות" subtitle={kind === "admin" ? "כל כלי הניהול שלך, במקום אחד" : "כל כלי העבודה שלך, במקום אחד"} labelledBy="shell-more-title">
        <label className="shell-search">
          <Icon name="search" size={18} />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש אפשרות…" aria-label="חיפוש אפשרות בתפריט" />
        </label>
        {groups.map(g => (
          <section key={g.title}>
            <h3 className="shell-menu-title">{g.title}</h3>
            <div className="shell-card shell-menu">
              {g.items.map(i => (
                <button key={i.path} type="button" className="shell-row" onClick={() => go(i.path)}
                  aria-current={path === i.path.split("?")[0] ? "page" : undefined}>
                  <span className="shell-circle"><Icon name={i.icon} /></span>
                  <span className="shell-grow"><strong>{i.label}</strong><small>{i.sub}</small></span>
                  <Icon name="arrow" size={18} className="shell-chev" />
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="shell-empty">לא נמצאה אפשרות בשם הזה.</p>}

        {!needle && <section>
          <h3 className="shell-menu-title">אישי</h3>
          <div className="shell-tools">
            {kind === "admin" && <GlobalSearch />}
            {kind === "admin" && <PersonalLinkPopup />}
            {kind === "admin" && <ViewAsControl />}
            <PushNotificationToggle />
          </div>
          <div className="shell-card shell-menu">
            <div className="shell-row shell-row-static">
              <span className="shell-circle">{initials(user?.name)}</span>
              <span className="shell-grow"><strong>{user?.name}</strong><small>{ROLE_LABEL[user?.role || ""] || user?.role}{user?.email ? ` · ${user.email}` : ""}</small></span>
            </div>
            <button type="button" className="shell-row" onClick={() => { setMoreOpen(false); logout() }}>
              <span className="shell-circle"><Icon name="logout" /></span>
              <span className="shell-grow"><strong>יציאה מהמערכת</strong></span>
            </button>
          </div>
        </section>}
      </Sheet>
    </div>
  )
}

/** Called just before the shell navigates away: keeps this screen's filters/search for the next visit. */
function rememberHere() {
  try {
    const u = new URL(location.href); u.searchParams.delete("new"); u.searchParams.delete("open")
    sessionStorage.setItem("netivim-last:" + u.pathname, u.pathname + u.search)
    sessionStorage.setItem("netivim-scroll:" + u.pathname, String(window.scrollY))
  } catch {}
}

/** The URL (with filters) the user last had on this screen, or the bare path. */
function lastUrl(path: string) {
  try { return sessionStorage.getItem("netivim-last:" + path) || path } catch { return path }
}

/**
 * Remembers the scroll position of each screen for the session, and puts
 * it back when the user returns to that screen through the bottom nav or
 * "עוד" — so leaving a list to check something doesn't lose your place.
 */
function useScrollMemory() {
  const path = usePathname()
  const prev = useRef<string | null>(null)
  useEffect(() => {
    const key = (p: string) => "netivim-scroll:" + p
    let t: any
    function save() {
      clearTimeout(t)
      t = setTimeout(() => { try { sessionStorage.setItem(key(location.pathname), String(window.scrollY)) } catch {} }, 120)
    }
    window.addEventListener("scroll", save, { passive: true })
    // Returning to a screen: restore once its content is tall enough.
    if (prev.current !== null && prev.current !== path) {
      let saved = 0
      try { saved = Number(sessionStorage.getItem(key(path)) || 0) } catch {}
      if (saved > 0) {
        let tries = 0
        const tick = () => {
          if (document.documentElement.scrollHeight - window.innerHeight >= saved - 4) window.scrollTo(0, saved)
          else if (tries++ < 30) setTimeout(tick, 80)
        }
        setTimeout(tick, 60)
      }
    }
    prev.current = path
    return () => { window.removeEventListener("scroll", save); clearTimeout(t) }
  }, [path])
}
