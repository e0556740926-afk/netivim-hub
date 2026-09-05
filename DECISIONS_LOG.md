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

## Verification methodology

Every stage: built and verified on a disposable Neon branch first
(row counts + row-level spot checks), replayed identically against `main`,
then re-verified with the same count queries. All 8 pre-existing tables
(`leads`, `contacts`, `tasks`, `events`, `coordinators`, `users`,
`monthly_targets`, `interactions`, `meetings`, `newsletter_subscribers`)
confirmed at their original row counts after every stage — zero data loss.
