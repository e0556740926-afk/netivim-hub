# 🗺 נתיבים Hub v2.5 Pro

פלטפורמת ניהול אקטיבית לרכזי שטח ומנהלי ארגון נתיבים.

## מה יש כאן

- **לוח בקרה (מנהל)** — מגדל פיקוח עם KPIs, Leaderboard, אירועים ממתינים לאישור, Action Center
- **יעדי לידים** — הגדרת יעדים חודשיים ומעקב ביצועים
- **Leaderboard** — תחרות בריאה בין הרכזים
- **ניהול אירועים** — מחזור חיי אירוע מלא (הצעה → אישור → ביצוע → תחקיר)
- **ממשק רכז (Mobile)** — דשבורד אישי, לידים, לינק אישי, משימות, דיווח שבועי
- **טופס ציבורי** — כל רכז מקבל URL ייחודי לאיסוף לידים

## התחלה מהירה

### 1. Clone ו-Install

```bash
git clone https://github.com/your-org/netivim-hub.git
cd netivim-hub
npm install
```

### 2. Supabase

1. צור פרויקט ב-[supabase.com](https://supabase.com)
2. הרץ את `supabase/schema.sql` ב-SQL Editor
3. העתק את Project URL ו-anon key

### 3. משתני סביבה

```bash
cp .env.example .env.local
# ערוך את .env.local עם הפרטים שלך
```

### 4. הרצה

```bash
npm run dev
```

פתח [http://localhost:3000](http://localhost:3000)

## כניסה למערכת

| משתמש | אימייל | סיסמה | תפקיד |
|---|---|---|---|
| מנהל | admin@netivim.org | netivim2025 | Admin |
| מיכל לוי | michal@netivim.org | netivim2025 | Coordinator |
| חיים שפר | haim@netivim.org | netivim2025 | Coordinator |

## פריסה ל-Vercel

```bash
npm install -g vercel
vercel
# הכנס את משתני הסביבה ב-Vercel Dashboard
```

## Stack

- **Framework** — Next.js 14 (App Router)
- **Database** — Supabase (PostgreSQL)
- **Styling** — Tailwind CSS (RTL)
- **Language** — TypeScript
- **Hosting** — Vercel

## מבנה הפרויקט

```
app/
  admin/          ← מסכי מנהל (sidebar)
    dashboard/    ← מגדל פיקוח
    targets/      ← יעדי לידים
    leaderboard/  ← טבלת מובילים
    events/       ← ניהול אירועים
    ...
  coord/          ← מסכי רכז (mobile bottom nav)
    home/         ← דשבורד אישי
    leads/        ← הלידים שלי
    link/         ← הלינק האישי
    profile/      ← דיווח שבועי
    ...
  j/[slug]/       ← טופס ציבורי לאיסוף לידים
components/
  ui/             ← Badge, Card, KPICard, Speedometer, Button
  admin/          ← Sidebar
  coord/          ← BottomNav
lib/
  supabase/       ← client, server, types
  auth-context.tsx ← React context
  utils.ts        ← helpers
supabase/
  schema.sql      ← הרץ ב-Supabase
```
