-- ══════════════════════════════════════════════════════════════════
-- Messaging center (מרכז דיוורים) — recipients, audiences, imports,
-- consents, suppressions, campaigns and a durable delivery queue.
-- Additive only: no existing table is changed or replaced. The
-- newsletter tables keep working as before; recipients link to them.
-- Every statement is idempotent (IF NOT EXISTS) and can be re-run.
-- ══════════════════════════════════════════════════════════════════

-- A person we may message. Optional links to existing site entities —
-- never created or changed from here (an import is not a lead).
CREATE TABLE IF NOT EXISTS msg_recipients (
  id serial PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'IL',
  city text NOT NULL DEFAULT '',
  org text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  newsletter_subscriber_id integer,
  lead_id integer,
  contact_id integer,
  manage_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS msg_recipients_subscriber_uq ON msg_recipients(newsletter_subscriber_id) WHERE newsletter_subscriber_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS msg_recipients_token_uq ON msg_recipients(manage_token);
CREATE INDEX IF NOT EXISTS msg_recipients_lead_idx ON msg_recipients(lead_id);
CREATE INDEX IF NOT EXISTS msg_recipients_contact_idx ON msg_recipients(contact_id);

-- Normalized email / phone. The send key is (kind, value_norm): one
-- address belongs to one recipient, so overlapping audiences never
-- produce two messages to the same address.
CREATE TABLE IF NOT EXISTS msg_endpoints (
  id serial PRIMARY KEY,
  recipient_id integer NOT NULL REFERENCES msg_recipients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email','phone')),
  value_raw text NOT NULL DEFAULT '',
  value_norm text NOT NULL,
  is_valid boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS msg_endpoints_value_uq ON msg_endpoints(kind, value_norm);
CREATE INDEX IF NOT EXISTS msg_endpoints_recipient_idx ON msg_endpoints(recipient_id);

CREATE TABLE IF NOT EXISTS msg_audiences (
  id serial PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  owner text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  system_key text,                        -- 'newsletter' = kept in sync with newsletter_subscribers
  archived boolean NOT NULL DEFAULT false,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS msg_audiences_name_uq ON msg_audiences(lower(btrim(name))) WHERE NOT archived;
CREATE UNIQUE INDEX IF NOT EXISTS msg_audiences_system_uq ON msg_audiences(system_key) WHERE system_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS msg_audience_members (
  audience_id integer NOT NULL REFERENCES msg_audiences(id) ON DELETE CASCADE,
  recipient_id integer NOT NULL REFERENCES msg_recipients(id) ON DELETE CASCADE,
  import_job_id integer,
  added_by text NOT NULL DEFAULT '',
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audience_id, recipient_id)
);
CREATE INDEX IF NOT EXISTS msg_members_recipient_idx ON msg_audience_members(recipient_id);

-- Permission to contact, per channel and topic — append-only history.
-- The latest row per (recipient, channel, topic) is the current state.
-- 'unknown' is the default for anything imported without a basis.
CREATE TABLE IF NOT EXISTS msg_consents (
  id serial PRIMARY KEY,
  recipient_id integer NOT NULL REFERENCES msg_recipients(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  topic text NOT NULL DEFAULT 'marketing',
  status text NOT NULL CHECK (status IN ('granted','unknown','revoked')),
  source text NOT NULL DEFAULT '',
  evidence text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS msg_consents_lookup_idx ON msg_consents(recipient_id, channel, topic, created_at DESC);

-- Opt-outs / blocks by address. 'all' = every marketing channel. An
-- import never deletes a row here; re-subscribing is its own flow.
CREATE TABLE IF NOT EXISTS msg_suppressions (
  id serial PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp','all')),
  value_norm text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('unsubscribe','bounce','complaint','manual','stop')),
  source text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS msg_suppressions_uq ON msg_suppressions(channel, value_norm, reason);
CREATE INDEX IF NOT EXISTS msg_suppressions_value_idx ON msg_suppressions(value_norm);

CREATE TABLE IF NOT EXISTS msg_import_jobs (
  id serial PRIMARY KEY,
  file_name text NOT NULL DEFAULT '',
  file_size integer NOT NULL DEFAULT 0,
  sheet text NOT NULL DEFAULT '',
  headers jsonb NOT NULL DEFAULT '[]',
  mapping jsonb NOT NULL DEFAULT '{}',
  default_country text NOT NULL DEFAULT 'IL',
  audience_id integer REFERENCES msg_audiences(id),
  options jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','validated','importing','done','failed','cancelled')),
  total_rows integer NOT NULL DEFAULT 0,
  counts jsonb NOT NULL DEFAULT '{}',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- One primary outcome per file row, so outcomes always sum to rows read.
CREATE TABLE IF NOT EXISTS msg_import_rows (
  job_id integer NOT NULL REFERENCES msg_import_jobs(id) ON DELETE CASCADE,
  row_no integer NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  outcome text NOT NULL CHECK (outcome IN ('new','existing','duplicate','invalid','suppressed','conflict')),
  reason text NOT NULL DEFAULT '',
  recipient_id integer,
  applied boolean NOT NULL DEFAULT false,
  PRIMARY KEY (job_id, row_no)
);

CREATE TABLE IF NOT EXISTS msg_campaigns (
  id serial PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  name text NOT NULL DEFAULT '',
  goal text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','queued','sending','sent','partial','stopped','failed')),
  audience_ids integer[] NOT NULL DEFAULT '{}',
  exclude_audience_ids integer[] NOT NULL DEFAULT '{}',
  content jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1,
  approved_revision integer,
  approved_content jsonb,
  approved_by text,
  approved_at timestamptz,
  scheduled_at timestamptz,
  snapshot_at timestamptz,
  completed_at timestamptz,
  archive_issue_id integer,
  last_error text NOT NULL DEFAULT '',
  stats jsonb NOT NULL DEFAULT '{}',      -- eligibility snapshot at approval (selected / eligible / excluded by reason)
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The delivery queue. UNIQUE(campaign, address) is what makes a double
-- click, a retried approval or two workers unable to send twice.
CREATE TABLE IF NOT EXISTS msg_campaign_recipients (
  id serial PRIMARY KEY,
  campaign_id integer NOT NULL REFERENCES msg_campaigns(id) ON DELETE CASCADE,
  recipient_id integer NOT NULL REFERENCES msg_recipients(id),
  address text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','accepted','delivered','failed','skipped','unknown','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  provider_id text,
  last_error text NOT NULL DEFAULT '',
  opened_at timestamptz,
  clicked_at timestamptz,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS msg_cr_unique ON msg_campaign_recipients(campaign_id, address);
CREATE INDEX IF NOT EXISTS msg_cr_queue_idx ON msg_campaign_recipients(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS msg_cr_provider_idx ON msg_campaign_recipients(provider_id);

-- Provider webhooks, de-duplicated by the provider's own event id.
CREATE TABLE IF NOT EXISTS msg_provider_events (
  id serial PRIMARY KEY,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  campaign_recipient_id integer,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS msg_provider_events_uq ON msg_provider_events(provider, provider_event_id);

-- Activity log for the center (who imported / approved / stopped what).
CREATE TABLE IF NOT EXISTS msg_activity (
  id serial PRIMARY KEY,
  actor text NOT NULL DEFAULT '',
  action text NOT NULL,
  entity text NOT NULL DEFAULT '',
  entity_id integer,
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- System audience mirroring the existing newsletter list.
INSERT INTO msg_audiences(name, description, source, system_key)
SELECT 'נרשמי הניוזלטר', 'מסונכרן אוטומטית מרשימת הניוזלטר הקיימת', 'ניוזלטר', 'newsletter'
WHERE NOT EXISTS (SELECT 1 FROM msg_audiences WHERE system_key='newsletter');

-- ════════════════════════════════════════════════════════════════
-- SMS replies menu + "לידים מקמפיינים" (2026-10-22)
-- Additive only. A campaign's reply menu lives in content.replies.
-- ════════════════════════════════════════════════════════════════

-- First reply per delivery (for the funnel: sent → delivered → replied).
ALTER TABLE msg_campaign_recipients ADD COLUMN IF NOT EXISTS replied_at timestamptz;
ALTER TABLE msg_campaign_recipients ADD COLUMN IF NOT EXISTS reply_key text;
CREATE INDEX IF NOT EXISTS msg_cr_address_sent_idx ON msg_campaign_recipients(address, sent_at DESC);

-- Every incoming reply (SMS today, WhatsApp later), matched or not.
CREATE TABLE IF NOT EXISTS msg_inbound (
  id serial PRIMARY KEY,
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','whatsapp','email')),
  provider text NOT NULL DEFAULT '019',
  provider_event_id text NOT NULL,
  from_norm text NOT NULL,
  to_number text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  campaign_id integer REFERENCES msg_campaigns(id) ON DELETE SET NULL,
  campaign_recipient_id integer,
  recipient_id integer,
  matched_key text,
  action text NOT NULL DEFAULT 'none',   -- callback / reply / unsubscribe / none
  auto_reply_status text NOT NULL DEFAULT '',
  handled boolean NOT NULL DEFAULT false,
  handled_by text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS msg_inbound_uq ON msg_inbound(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS msg_inbound_open_idx ON msg_inbound(handled, received_at DESC);

-- People to call back, from any campaign channel. One open row per person per campaign.
CREATE TABLE IF NOT EXISTS msg_callbacks (
  id serial PRIMARY KEY,
  campaign_id integer REFERENCES msg_campaigns(id) ON DELETE SET NULL,
  campaign_recipient_id integer,
  recipient_id integer REFERENCES msg_recipients(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp','email')),
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  request_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done','no_answer')),
  assignee_id integer,
  note text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS msg_callbacks_uq ON msg_callbacks(campaign_id, recipient_id) WHERE campaign_id IS NOT NULL AND recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS msg_callbacks_status_idx ON msg_callbacks(status, created_at DESC);
