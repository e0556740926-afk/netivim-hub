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
