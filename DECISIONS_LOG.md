# Decisions Log — Netivim Hub → Netivim CRM

Architectural decisions made during the schema build-out toward the full
"Netivim CRM" spec (see `netivim-crm-hub-integration-spec_md.pdf` and the
v2 characterization doc, both reviewed 2026-09-05). Aspire/call-center
integration (spec §9) and the Salesforce migration (spec §14) are
explicitly out of scope for this pass — third-party integrations, to be
handled separately.

## 2026-09-05 — Stage 1 (Group A): tasks.assigned_to + task_participants

- Added `tasks.assigned_to` (single owner, FK → users) and `task_participants`
  (many-to-many table for additional participants).
- Backfilled from `tasks.assignees text[]` by exact name match against
  `users.name` — verified 100% match across all 25 live rows, no ambiguity.
- `assignees` column **retained** for backward compatibility. App code
  (`tasks/route.ts`, `tasks/bulk`, `tasks/series`, `task-templates/apply`,
  `extract-tasks`, `ai-summary`) still reads/writes it unchanged. It will be
  dropped only after those routes are migrated to `assigned_to` +
  `task_participants` — a separate, later code change.
- Verified on Neon dev branch `br-gentle-king-ax1igxs9` first (25/25 tasks
  migrated, 9 participant rows, 0 nulls, row-by-row spot check passed), then
  replayed identically against `main` and re-verified with the same counts.

## 2026-09-05 — Stage 2 (Group B): institutions catalog

- New tables: `organizations`, `org_programs`, `retention_confirmations`,
  `institution_users`.
- `contacts` gains `organization_id` (FK → organizations). The table keeps
  its name and every existing row/id — `tasks.contact_id` and
  `interactions.contact_id` needed no changes.
- Backfilled `organizations` from 46 distinct non-empty `contacts.org`
  values; all 108 contact rows mapped, 0 left unmapped.
- **Open, non-automatable task**: `organizations.category` / `region` /
  `owner_type` / `owner_id` are NULL for all 46 rows. Hub never recorded
  which institutions are education-track (coordinator-owned) vs.
  military/hesder-track (Alexander-owned, per spec §2.2) — this needs a
  manual classification pass, not a script. Flagging here so it isn't
  mistaken for an oversight.

## 2026-09-05 — Stage 3 (Group C): consultation case file

- `leads` gains 8 new columns (`triage_color`, `first_touch_at`,
  `process_started_at`, `no_answer_attempts`, `inactive_reason`,
  `next_followup_at`, `support_round`, `sector`). All 18 existing rows,
  including the 1 soft-deleted row, preserved unchanged.
- New forward-looking view `cases AS SELECT * FROM leads` — table itself was
  **not** renamed (destructive rename explicitly excluded from this pass).
- New tables: `case_status_history`, `case_extended`, `case_protected`,
  `custom_field_defs`, `case_custom_values`, `referrals`.
- **Deliberately not done**: no `CHECK` constraint on `leads.status`. All 18
  live rows currently have `status='new'`, not one of the 7 canonical
  statuses from the spec (§6.3), and `app/api/leads/route.ts` writes status
  as free text with no server-side validation today. Locking a CHECK without
  first auditing what the actual UI sends risks blocking production writes.
  This needs a decision + a UI code audit before it's safe to add.

## 2026-09-05 — Stage 4 (Group D): budget, procurement, vendors

- New tables: `funding_sources`, `vendors`, `purchase_requests`,
  `purchase_orders`, `invoices`.
- `expenses` gains `funding_source_id`, `campaign_tag`, `region_tag`
  (`event_id` already existed from the earlier events upgrade).
- `budget_sources` and the old `expenses` structure are left untouched
  alongside the new tables — both were empty (0 rows) going in, so no
  migration was needed, only additive schema.

## Explicitly out of scope this pass

- **Aspire / call-center integration (spec §9)** — blocked on a technical
  meeting with Aspire that hasn't happened yet (per spec §16.2).
- **Salesforce migration (spec §14)** — blocked on a field-mapping session
  with Alexander Shiretzky and the 3 open CEO-level decisions in spec §16.1.

## 2026-09-05 — Code layer: API + UI for Stages A-D

- **New `leads.advisor_status`** (7-value enum, separate column from the
  existing `leads.status`). Deliberately kept separate rather than reusing
  `status`: code inspection showed `app/coord/leads/page.tsx` already runs
  a live 4-value cycle (`new→contacted→advanced→irrelevant`) that
  coordinators use today — overloading that field for the 7-stage advisor
  pipeline would have broken a screen in active use. `status` is untouched.
- **`lib/task-assignment.ts`** — shared helper (`syncAssignedAndParticipants`,
  `syncAssignedAndParticipantsForIds`) wired into all 4 places that write
  `tasks.assignees` (`tasks/route.ts`, `tasks/bulk`, `tasks/series`,
  `task-templates/apply`), so `assigned_to`/`task_participants` stay derived
  from `assignees[0]`/`assignees[1:]` going forward without touching any
  existing notify/audit logic. `tasks` GET responses now also include
  `assigned_to_name` and `participant_names`.
- **New API routes**: `/api/organizations` (+`[id]` for programs/contacts),
  `/api/cases` (advisor_status transitions with an explicit allowed-transition
  table per spec §6.3, logs to `case_status_history`), `/api/cases/[id]`
  (extended/protected tiers — opening protected info is a logged action per
  spec §6.1 — plus triage-color with a simple red-flag task auto-created for
  a `role='rav'` user if one exists), `/api/referrals` (enforces "≤3
  concurrent" per spec §7.1, returns sibling referrals for the UI to offer
  closing when one is accepted, auto-advances/reverts case status on
  referral outcome), `/api/budget/funding-sources`, `/api/budget/vendors`,
  `/api/budget/purchase-requests` (simple one-click approve → creates a
  `purchase_orders` row).
- `middleware.ts`: new routes gated admin-only except `GET /api/organizations`
  (coordinators still need it for the contacts screen).
- **New UI pages**: `/admin/organizations` (+ detail), `/admin/cases`
  (+ detail: status buttons, triage dots, extended/protected/referrals/history
  tabs), `/admin/budget` (sources/vendors/requests tabs). `/admin/tasks`
  kanban got one additive badge (`+N` participants) — no existing behavior
  changed.
- **Honest scope note**: these are functional, data-correct screens, not a
  pixel-accurate build of the 27-screen design package (no 4-column live
  Advisor Desk board with SLA gauges, no 3-step Referral Wizard modal, no
  Institution/Advisee self-service portals, no Executive/CEO/Funder
  dashboards, no Field Builder live preview, no call-center QA). Those
  remain separate, larger pieces of work.
- Verified: `npm run build` — TypeScript clean, all 93 routes compiled,
  static generation succeeded.

## 2026-09-05 — Stage 1 (Case File, B2-B3): rebuilt to match the mockup exactly

- New table `case_interactions` (case_id, type, summary, next_step,
  created_by, created_at) — the design's "יומן קשר" tab needed a log tied
  to the *case*, distinct from the existing `interactions` table which is
  keyed to `contacts.id` (organization-side people), not `leads.id`.
- `/api/cases/[id]` extended: `GET` now joins `coordinators` for the
  "הובאה ע״י" referrer badge; new `log_interaction` action; `set_triage`
  now accepts `description`/`urgency`/`ask` and writes them into the
  auto-created Rav Obermeister escalation task instead of a hardcoded string.
- `/admin/cases/[id]` rebuilt from `screens/B2-Case-File.dc.html` directly:
  sticky action rail (סטטוס/רמזור/הפניה/תיעוד), header with SLA breach dot
  and referrer badge, 5 tabs (סקירה/שאלון קליטה/מידע מוגן/יומן קשר/הפניות),
  3 modals matching the mock's exact copy and blocking behavior (status
  change with a radio-gated "לא פעיל" reason, "הופנה למסגרת" blocked with
  the exact warning copy when no active referral exists, red-triage form
  addressed to Rav Obermeister). Colors/radii/spacing taken from
  `design-tokens/tokens.css`, not improvised.
- Two tabs from the mock (משימות, מסמכים, התייעצות רב) are visible in the
  design as placeholders and were **not** built — no backing data model
  exists yet for case-scoped task filtering beyond the general task list,
  or for document attachments.
- Verified: `npm run build` clean, `/admin/cases/[id]` and `/api/cases/[id]`
  compiled successfully.

## 2026-09-05 — Stage 2 (Referral Wizard, B4-B5) + Stage 3 (Organizations, D1-D2)

- **Referral Wizard**: `components/cases/ReferralWizard.tsx`, a 3-step modal
  matching `screens/B4-B5-Referral-Wizard.dc.html` exactly (institution/track
  selection with match %, exact preview of what the institution will see,
  confirm & send). New `/api/referrals/suggestions`: a transparent scoring
  heuristic (category/interest overlap + program capacity + age fit) — **not
  a trained matching model**, since none exists; every suggestion carries a
  `reason` string so the advisor sees why, not just a bare percentage.
- **Organizations**: added `organizations.rating`, `relationship_status`,
  `description`, `total_students` (all nullable/defaulted, additive).
  `/admin/organizations` (D1) rebuilt with the cards/table toggle, filters,
  and free search from the mock. `/admin/organizations/[id]` (D2) rebuilt
  with the two stat cards, 3 tabs (סקירה/מסלולים/הבחורים שלנו).
  - "שלחנו אליהם" (sent) is real, computed from `referrals`.
  - "הם הפנו אלינו" (received) has **no backing data model** — Hub never
    recorded inbound institution-initiated referrals as a distinct concept —
    shown honestly as "עדיין לא נמדד" rather than a fabricated number.
  - "מדד התמדה היסטורי" computed as completed-successfully ÷ ever-accepted
    referrals for that org; shows "אין עדיין נתונים" when there's no
    referral history yet, rather than 0% or a guess.
  - The mock's D2 also shows tabs for אנשי קשר / יומן אינטראקציות / פגישות
    — **not built**: contacts are visible via the Organizations detail's own
    `contacts` array in the API response but not surfaced as their own tab
    yet, and there's no org-level interaction/meeting log distinct from
    `case_interactions` (which is case-scoped, not institution-scoped).
  - Note: the brief's D1-D3 numbering doesn't map to 3 separate files — the
    design package only ships D1 (list) and D2 (profile, tracks as one of
    its tabs); there's no separate "D3" mock to build against.
- Verified: `npm run build` clean after both stages.

## 2026-09-05 — Stage 4 (Budget F1-F2) + Stage 5 (Admin/Field Builder/Settings I2-I4)

- Correction: the brief's task list said "E1-E3" for budget — the design
  package actually ships this as **F1 (Budget Dashboard)** and **F2 (Funding
  Sources)**; there's no separate procurement/vendor screen in the 27-screen
  set. Read and built against the real files, not the brief's numbering.
- `organizations` gains `rating`, `relationship_status`, `description`,
  `total_students`; `custom_field_defs` gains `required`, `in_list`,
  `visible_roles text[]`, `group_name` — all additive.
- **F1 Budget Dashboard**: period-elapsed %, utilized %, monthly burn rate
  (avg of last 3 months with paid expenses), forecast — all computed live
  from `funding_sources` + `expenses`, not mock numbers. The mock's
  category×month heatmap and "top 5 overages" need a **per-category budget
  target that doesn't exist in the schema** — substituted with a plain
  "spend by category" breakdown and said so on-screen, rather than
  fabricating thresholds to make a heatmap look real.
- **F2 Funding Sources**: real status logic — a source is flagged
  "דורש טיפול דחוף" when its period ends within 30 days AND under 50% is
  used; "מתקרב לסוף תקופה" within 60 days; otherwise "תקין". Matches the
  mock's example case exactly in spirit, computed rather than hardcoded.
- **Procurement (vendors/purchase requests)**: kept at `/admin/budget/procurement`
  in the app's plain existing style — explicitly not "matched" to any mock
  because none exists for it in the design package.
- **I2 Field Builder**: full rebuild — field list (label/type/required/
  in-list/visible-roles), create/edit panel with a real option-list editor,
  a genuinely reactive live preview (updates on every keystroke, matching
  the mock's specific requirement), and a value-lists overview at the
  bottom. Backed by `/api/admin/custom-fields` (CRUD + reorder).
- **I3 Automation Settings**: all 5 thresholds from the mock (follow-up
  window, support check-in months, SLA hours, no-answer attempts, retention
  frequency), stored in the existing `app_settings` key/value table, editable
  live. **Important limitation**: these values are now real and persisted,
  but nothing else in the app reads them yet — the SLA threshold used in
  Advisor Desk/Case File is still the hardcoded `SLA_HOURS = 24` constant,
  the referral follow-up automation described in spec §5 isn't running as a
  scheduled job, etc. This screen is the control panel; wiring the rest of
  the app to actually read these settings is separate follow-up work.
- **I4 Audit Log**: real data from the existing `audit_log` table, with the
  "all actions" / "protected-info views" tab split and user/entity filters
  from the mock. The mock's "before"/"after" columns aren't buildable as-is:
  `audit_log.summary` is free text (per the earlier integration-spec
  finding), not structured before/after values — shown as a single
  "פירוט" column instead, with an on-screen note explaining why.
- **I1 Users & Permissions**: not rebuilt — `/admin/settings` already
  covers this (users table, roles, status) in the app's existing style.
  Linked to the three new screens above rather than duplicated.
- Verified: `npm run build` clean, all new routes compiled
  (`/admin/settings/fields`, `/automation`, `/audit-log`,
  `/api/admin/custom-fields`, `/api/admin/automation-settings`).

## 2026-09-05 — Stage 6 (Dashboards G1-G3 + External Portals H1-H5)

- **Shared aggregation**: `/api/dashboards/summary` computes every metric
  used by all three management dashboards once (funnel, dropout reasons,
  demographics, category placements, budget-by-source, coordinator
  performance vs targets, pending approvals, 12-month placement trend,
  response time, process duration) — all real queries, not mock numbers.
  Fields with genuinely no backing data model (`call_center_qc`,
  `staffing_positions`, `retention_rates`) are returned as `null` so the UI
  shows an honest "not available yet" state instead of a fabricated figure.
- **G1 Executive / G2 CEO / G3 Funder** dashboards built against that
  endpoint. G2's approve/reject buttons required adding a safe
  `status_only` PATCH mode to `/api/expenses` (mirroring the existing
  pattern in `/api/tasks`) — the prior PATCH required every field and would
  have silently wiped `description`/`vendor`/`amount` on a bare
  `{id, status}` call. G3 is fully aggregate/de-identified (no names in the
  query at all) but its "export" button is a raw JSON download of the
  summary, not a per-block formatted Excel/PDF export like the mock implies.
- **Correction on numbering**: the brief calls G1 "Director Dashboard" —
  the design package's own file is `G1-Executive-Dashboard.dc.html`; built
  against the real file.
- **External portals — real token-based auth, not staff sessions**:
  added `institution_users.access_token` and `leads.advisee_access_token`
  (unique random tokens, additive). `/api/portal/*` added to the public
  route list (secured by the token in the URL, matching the existing
  `calendar_token` pattern in this codebase) — every portal query resolves
  organization/case from the token server-side first; a referral or
  confirmation ID belonging to a different institution is rejected even if
  guessed, because the `WHERE` clause checks `organization_id`/token-derived
  scope too, not just the record's own ID.
- **H1-H3 Institution Portal**: one combined mobile-first page — 4-number
  dashboard, pending referrals with inline status update (interview
  scheduled/accepted/rejected/enrolled), current roster, history, and the
  quarterly retention "is everyone still here" flow with a per-person
  "left" toggle — all matching the mock's copy and layout closely, backed
  by real `referrals`/`leads`/`retention_confirmations` data. Added a
  "פורטל מוסד" tab on the Organizations detail page to create portal
  accounts and copy their links.
- **H4 Advisee Portal**: real status message (mapped from `advisor_status`),
  real active referrals, and a working "message to advisor" that logs to
  the new `case_interactions` table and opens a real task for the case
  owner. The mock's "forms to fill" and "upcoming meetings" sections were
  **not built** — there's no forms system or advisee-facing meeting model
  in this schema (the existing `meetings` table is an internal
  coordinator/manager log, not advisee-facing).
- **H5 Public Info Portal**: fully static (guides/FAQ/alumni stories are
  hardcoded content, no DB read) with zero external scripts, per the
  spec's constraint. Its contact form reuses the existing public
  `POST /api/leads` endpoint rather than a new one. Required widening
  `leads.source`'s CHECK constraint to add `'info_portal'` as a 4th allowed
  value (additive — existing `manual`/`link`/`event` rows untouched,
  verified 18/18 preserved with source values intact).
- Verified: `npm run build` clean, all new routes compiled
  (`/admin/dashboards/{executive,ceo,funder}`, `/api/dashboards/summary`,
  `/portal/institution/[token]`, `/portal/advisee/[token]`, `/portal/info`,
  `/api/portal/**`, `/api/admin/institution-portal-users/[orgId]`).
- Full data-integrity check across the whole build-out: `leads`=18,
  `contacts`=108, `organizations`=46, `events`=2, `coordinators`=2,
  `users`=6 — all unchanged from the session's original baseline.
  `tasks`=26 (was 25) — this reflects real coordinator activity on the live
  system during this session, not anything this build touched.

## Verification methodology

Every stage: built and verified on a disposable Neon branch first
(row counts + row-level spot checks), replayed identically against `main`,
then re-verified with the same count queries. All 8 pre-existing tables
(`leads`, `contacts`, `tasks`, `events`, `coordinators`, `users`,
`monthly_targets`, `interactions`, `meetings`, `newsletter_subscribers`)
confirmed at their original row counts after every stage — zero data loss.
