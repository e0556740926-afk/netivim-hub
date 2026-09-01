-- ============================================================
-- נתיבים שטח — Migration 001
-- Run ONCE in the Neon SQL Editor.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- ── B3: columns that were being added at runtime on every request ──
ALTER TABLE users        ADD COLUMN IF NOT EXISTS phone          text DEFAULT '';
ALTER TABLE users        ADD COLUMN IF NOT EXISTS calendar_token text;
ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS calendar_token text;
ALTER TABLE leads        ADD COLUMN IF NOT EXISTS id_number      text DEFAULT '';
ALTER TABLE leads        ADD COLUMN IF NOT EXISTS owner_name     text DEFAULT '';

-- budget_sources was created lazily by the API; define it properly here
CREATE TABLE IF NOT EXISTS budget_sources (
  id           bigserial PRIMARY KEY,
  name         text NOT NULL,
  description  text DEFAULT '',
  total_amount numeric DEFAULT 0,
  used_amount  numeric DEFAULT 0,
  year         integer NOT NULL,
  category     text DEFAULT 'other',
  status       text DEFAULT 'active',
  created_at   timestamptz DEFAULT now()
);

-- ── B2: lead score as a real column instead of text inside notes ──
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score integer;

-- Backfill from the "ציון: N" marker previously embedded in notes
UPDATE leads
SET score = NULLIF(substring(notes FROM 'ציון: ([0-9]+)'), '')::integer
WHERE score IS NULL
  AND notes ~ 'ציון: [0-9]+';

-- Strip the marker out of the free-text notes
UPDATE leads
SET notes = btrim(
      regexp_replace(
        regexp_replace(notes, '\s*\|?\s*ציון: [0-9]+', '', 'g'),
        '^\s*\|\s*', ''
      )
    )
WHERE notes ~ 'ציון: [0-9]+';

-- Anything still without a score gets the neutral default
UPDATE leads SET score = 5 WHERE score IS NULL;

-- ── B4: indexes on every foreign key and hot filter column ──
CREATE INDEX IF NOT EXISTS idx_contacts_coordinator     ON contacts(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_contacts_owner           ON contacts(owner);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact    ON contacts(last_contact);

CREATE INDEX IF NOT EXISTS idx_interactions_contact     ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_coordinator ON interactions(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date        ON interactions(date);

CREATE INDEX IF NOT EXISTS idx_leads_coordinator        ON leads(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_leads_created            ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_phone              ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status             ON leads(status);

CREATE INDEX IF NOT EXISTS idx_tasks_coordinator        ON tasks(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_tasks_event              ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact            ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due                ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status             ON tasks(status);
-- assignees is a text[]; GIN makes `= ANY(assignees)` fast
CREATE INDEX IF NOT EXISTS idx_tasks_assignees          ON tasks USING GIN(assignees);

CREATE INDEX IF NOT EXISTS idx_events_coordinator       ON events(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_events_date              ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_status            ON events(status);

CREATE INDEX IF NOT EXISTS idx_expenses_event           ON expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date            ON expenses(date);

CREATE INDEX IF NOT EXISTS idx_reports_coordinator      ON weekly_reports(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_reports_week             ON weekly_reports(week_start);

CREATE INDEX IF NOT EXISTS idx_meetings_coordinator     ON meetings(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_targets_coordinator      ON monthly_targets(coordinator_id);

-- Token lookups happen on every calendar feed fetch
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cal_token   ON users(calendar_token)        WHERE calendar_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coord_cal_token   ON coordinators(calendar_token) WHERE calendar_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coord_user               ON coordinators(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email              ON users(email);

-- ── Done ──
SELECT 'migration 001 complete' AS status;

-- ============================================================
-- B6: soft delete — deleting a contact or lead is recoverable
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE leads    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contacts_not_deleted ON contacts(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_not_deleted    ON leads(deleted_at)    WHERE deleted_at IS NULL;

-- ============================================================
-- E1: audit log — who changed what, and when
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id           bigserial PRIMARY KEY,
  entity_type  text NOT NULL,     -- 'contact' | 'lead' | 'task' | 'event'
  entity_id    integer NOT NULL,
  action       text NOT NULL,     -- 'create' | 'update' | 'delete' | 'restore'
  actor_name   text DEFAULT '',
  actor_email  text DEFAULT '',
  summary      text DEFAULT '',   -- short human-readable line, e.g. "סטטוס: חדש → פעיל"
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ============================================================
-- Lead email field, for Silfrus (Salesforce) integration
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email text DEFAULT '';

-- ============================================================
-- Web Push subscriptions — one row per device a user enabled
-- push notifications on
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_email ON push_subscriptions(email);

-- ============================================================
-- Personal link (slug) for managers too — previously only
-- coordinators had one via the coordinators table
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- ============================================================
-- Recurring tasks — a task can repeat daily/weekly/monthly.
-- Each occurrence is its own row so an unfinished one stays open
-- exactly where it was, and the same recurring task can be open
-- more than once at a time.
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence text;         -- 'daily' | 'weekly' | 'monthly' | NULL
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS next_run date;           -- when the next occurrence should be created
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_series_id bigint; -- links generated occurrences back to their template, for display grouping
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence ON tasks(recurrence) WHERE recurrence IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run) WHERE next_run IS NOT NULL;


-- ============================================================
-- Task priority/urgency
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

-- ============================================================
-- Newsletter — parent subscribers + a tiny generic settings
-- table (reused for lazily-created external IDs like the
-- Resend audience, so no manual setup step is required)
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id               bigserial PRIMARY KEY,
  name             text NOT NULL,
  email            text NOT NULL UNIQUE,
  coordinator_id   bigint REFERENCES coordinators(id) ON DELETE SET NULL,
  source           text DEFAULT 'general',   -- 'general' | 'coordinator'
  status           text DEFAULT 'active',    -- 'active' | 'unsubscribed'
  resend_contact_id text,
  created_at       timestamptz DEFAULT now(),
  unsubscribed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_newsletter_coordinator ON newsletter_subscribers(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_created ON newsletter_subscribers(created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id           bigserial PRIMARY KEY,
  subject      text NOT NULL,
  intro        text DEFAULT '',
  blocks       jsonb DEFAULT '[]',   -- [{title, text}]
  closing      text DEFAULT '',
  sent_at      timestamptz,
  recipients   integer DEFAULT 0,
  resend_broadcast_id text,
  created_by   text DEFAULT '',
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- Task upgrades (coordinator/manager split) — 01.09.2026
-- All additive, idempotent, applied via Neon MCP per project
-- convention. hasColumn()/information_schema gates cover the
-- code side, this file is the durable record.
-- ============================================================

-- SLA aging: when did the status last change (not just created_at).
-- A trigger keeps this correct regardless of which code path updates
-- the row (API route, recurring-tasks function, direct SQL) instead
-- of relying on every call site remembering to set it.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_changed_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION set_task_status_changed_at() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_status_changed ON tasks;
CREATE TRIGGER trg_tasks_status_changed
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_status_changed_at();

CREATE INDEX IF NOT EXISTS idx_tasks_status_changed ON tasks(status_changed_at);

-- Per-channel notification delivery visibility (email/whatsapp/push
-- known-sent vs known-failed), surfaced to managers given the known
-- unverified-Resend-domain issue.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_log jsonb DEFAULT '[]';

-- Comments thread on a task (coordinator <-> manager, in-app instead
-- of falling back to whatsapp/email for every back-and-forth).
CREATE TABLE IF NOT EXISTS task_comments (
  id bigserial PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- Sub-tasks / checklist for multi-step tasks.
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id bigserial PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text text NOT NULL,
  done boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id);

-- Manual task templates for managers (e.g. "onboarding sequence").
-- Applied only by explicit manager action from the admin tasks
-- screen — never auto-triggered by a lead/contact/event event.
CREATE TABLE IF NOT EXISTS task_templates (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  created_by text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_template_items (
  id bigserial PRIMARY KEY,
  template_id bigint NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text DEFAULT 'call',
  priority text DEFAULT 'normal',
  offset_days integer DEFAULT 0,
  sort_order integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_task_template_items_template ON task_template_items(template_id);

-- Note (no schema action taken): tasks.meeting_id has no FK and no
-- code in the app currently reads or writes it (grep confirmed zero
-- references outside this column's own definition) — left untouched
-- rather than guessing at a constraint for a dead column.
