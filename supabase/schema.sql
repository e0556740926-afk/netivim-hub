-- נתיבים Hub v2.5 Pro — Supabase Schema
-- Run this in Supabase SQL Editor

-- Drop existing tables (if rebuilding)
drop table if exists weekly_reports cascade;
drop table if exists meetings cascade;
drop table if exists monthly_targets cascade;
drop table if exists expenses cascade;
drop table if exists tasks cascade;
drop table if exists interactions cascade;
drop table if exists leads cascade;
drop table if exists events cascade;
drop table if exists contacts cascade;
drop table if exists coordinators cascade;
drop table if exists users cascade;

-- Users
create table users (
  id bigint primary key generated always as identity,
  name text not null,
  email text unique not null,
  password text not null,
  role text not null default 'coordinator' check (role in ('admin','coordinator','viewer')),
  status text not null default 'active' check (status in ('active','inactive')),
  phone text default '',
  area text default '',
  created_at timestamptz default now()
);

-- Coordinators (extended profile)
create table coordinators (
  id bigint primary key generated always as identity,
  user_id bigint references users(id) on delete cascade,
  name text not null,
  role text default 'רכז שטח',
  area text default '',
  email text default '',
  phone text default '',
  slug text unique, -- for public lead form URL
  created_at timestamptz default now()
);

-- Contacts / Partners
create table contacts (
  id bigint primary key generated always as identity,
  coordinator_id bigint references coordinators(id) on delete set null,
  owner text default '',
  name text not null,
  org text default '',
  role text default '',
  phone text default '',
  email text default '',
  type text default 'partner' check (type in ('partner','authority','vendor','lead')),
  status text default 'cold' check (status in ('active','initial','meeting','cold','irrelevant')),
  potential integer default 1 check (potential between 1 and 3),
  last_contact date,
  notes text default '',
  created_at timestamptz default now()
);

-- Interactions with contacts
create table interactions (
  id bigint primary key generated always as identity,
  contact_id bigint references contacts(id) on delete cascade,
  coordinator_id bigint references coordinators(id) on delete set null,
  date date not null,
  type text default 'call' check (type in ('call','meeting','whatsapp','email','other')),
  summary text default '',
  next_step text default '',
  created_at timestamptz default now()
);

-- Events
create table events (
  id bigint primary key generated always as identity,
  coordinator_id bigint references coordinators(id) on delete set null,
  partner_contact_id bigint references contacts(id) on delete set null,
  name text not null,
  date date,
  time text default '',
  location text default '',
  status text default 'planning' check (status in ('planning','pending_approval','approved','marketing','done','cancelled')),
  budget_planned integer default 0,
  target_attendees integer default 0,
  actual_attendees integer default 0,
  leads_collected integer default 0,
  summary text default '',
  approved boolean default false,
  created_at timestamptz default now()
);

-- Leads
create table leads (
  id bigint primary key generated always as identity,
  coordinator_id bigint references coordinators(id) on delete set null,
  event_id bigint references events(id) on delete set null,
  name text not null,
  phone text not null,
  age integer,
  city text default '',
  interest text default 'training',
  source text default 'manual' check (source in ('link','event','manual')),
  status text default 'new' check (status in ('new','contacted','advanced','irrelevant')),
  notes text default '',
  created_at timestamptz default now()
);

-- Tasks
create table tasks (
  id bigint primary key generated always as identity,
  coordinator_id bigint references coordinators(id) on delete set null,
  event_id bigint references events(id) on delete set null,
  contact_id bigint references contacts(id) on delete set null,
  meeting_id bigint,
  title text not null,
  details text default '',
  type text default 'call' check (type in ('call','meeting','materials','backoffice')),
  assignees text[] default '{}',
  due_date date,
  status text default 'todo' check (status in ('todo','inprogress','waiting','done')),
  created_at timestamptz default now()
);

-- Expenses
create table expenses (
  id bigint primary key generated always as identity,
  event_id bigint references events(id) on delete set null,
  description text not null,
  vendor text default '',
  amount numeric default 0,
  date date,
  status text default 'pending' check (status in ('paid','pending','cancelled')),
  category text default 'other' check (category in ('equipment','marketing','catering','venue','other')),
  created_at timestamptz default now()
);

-- Weekly Reports
create table weekly_reports (
  id bigint primary key generated always as identity,
  coordinator_id bigint references coordinators(id) on delete cascade,
  week_start date not null,
  achievements text default '',
  challenges text default '',
  leads_count integer default 0,
  next_week_plan text default '',
  submitted_at timestamptz default now()
);

-- 1:1 Meetings
create table meetings (
  id bigint primary key generated always as identity,
  coordinator_id bigint references coordinators(id) on delete cascade,
  manager_id bigint references users(id) on delete set null,
  date date not null,
  type text default 'regular' check (type in ('regular','urgent','goal')),
  agenda text default '',
  summary text default '',
  next_meeting_date date,
  created_at timestamptz default now()
);

-- Monthly Targets
create table monthly_targets (
  id bigint primary key generated always as identity,
  coordinator_id bigint references coordinators(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null,
  target_leads integer default 0,
  unique(coordinator_id, month, year)
);

-- RLS
alter table users enable row level security;
alter table coordinators enable row level security;
alter table contacts enable row level security;
alter table interactions enable row level security;
alter table events enable row level security;
alter table leads enable row level security;
alter table tasks enable row level security;
alter table expenses enable row level security;
alter table weekly_reports enable row level security;
alter table meetings enable row level security;
alter table monthly_targets enable row level security;

-- Open policies (auth managed in app layer)
create policy "open" on users for all using (true) with check (true);
create policy "open" on coordinators for all using (true) with check (true);
create policy "open" on contacts for all using (true) with check (true);
create policy "open" on interactions for all using (true) with check (true);
create policy "open" on events for all using (true) with check (true);
create policy "open" on leads for all using (true) with check (true);
create policy "open" on tasks for all using (true) with check (true);
create policy "open" on expenses for all using (true) with check (true);
create policy "open" on weekly_reports for all using (true) with check (true);
create policy "open" on meetings for all using (true) with check (true);
create policy "open" on monthly_targets for all using (true) with check (true);

-- Seed: Admin user
insert into users (name, email, password, role, status, phone) values
('מנהל ראשי', 'admin@netivim.org', 'netivim2025', 'admin', 'active', '052-0000001');

-- Seed: Coordinator users
insert into users (name, email, password, role, status, phone, area) values
('מיכל לוי', 'michal@netivim.org', 'netivim2025', 'coordinator', 'active', '054-1111111', 'מרכז'),
('יוסי אברהם', 'yossi@netivim.org', 'netivim2025', 'coordinator', 'active', '054-2222222', 'דרום'),
('דנה כהן', 'dana@netivim.org', 'netivim2025', 'coordinator', 'active', '054-3333333', 'צפון'),
('חיים שפר', 'haim@netivim.org', 'netivim2025', 'coordinator', 'active', '054-4444444', 'מרכז');

-- Seed: Coordinators
insert into coordinators (user_id, name, role, area, email, phone, slug) values
(2, 'מיכל לוי', 'רכזת קשרי קהילה', 'מרכז', 'michal@netivim.org', '054-1111111', 'michal-levi'),
(3, 'יוסי אברהם', 'רכז תפעול שטח', 'דרום', 'yossi@netivim.org', '054-2222222', 'yossi-avraham'),
(4, 'דנה כהן', 'רכזת שותפויות', 'צפון', 'dana@netivim.org', '054-3333333', 'dana-cohen'),
(5, 'חיים שפר', 'רכז שטח', 'מרכז', 'haim@netivim.org', '054-4444444', 'haim-shefer');

-- Seed: Monthly targets (August 2026)
insert into monthly_targets (coordinator_id, month, year, target_leads) values
(1, 8, 2026, 60),
(2, 8, 2026, 50),
(3, 8, 2026, 45),
(4, 8, 2026, 55);

-- Seed: Sample leads
insert into leads (coordinator_id, name, phone, city, interest, source, status, created_at) values
(1, 'אלי כהן', '054-5555551', 'בני ברק', 'training', 'link', 'contacted', '2026-08-10T10:00:00Z'),
(1, 'רון לוי', '054-5555552', 'פתח תקווה', 'service', 'event', 'new', '2026-08-12T11:00:00Z'),
(1, 'שי מזרחי', '054-5555553', 'רחובות', 'training', 'manual', 'advanced', '2026-08-14T09:00:00Z'),
(2, 'גיא פרץ', '054-5555554', 'אשדוד', 'military', 'link', 'new', '2026-08-08T14:00:00Z'),
(2, 'נועם כץ', '054-5555555', 'אשקלון', 'training', 'manual', 'contacted', '2026-08-15T10:00:00Z'),
(3, 'תום שני', '054-5555556', 'חיפה', 'service', 'link', 'new', '2026-08-11T09:00:00Z'),
(4, 'דביר אוחיון', '054-5555557', 'ת"א', 'training', 'link', 'contacted', '2026-08-13T15:00:00Z'),
(4, 'ליאל בן דוד', '054-5555558', 'רמת גן', 'military', 'event', 'new', '2026-08-16T10:00:00Z');

-- Seed: Events
insert into events (coordinator_id, name, date, time, location, status, budget_planned, target_attendees, actual_attendees, leads_collected, approved) values
(1, 'יריד תעסוקה – בני ברק', '2026-09-14', '17:00', 'מרכז קהילתי בני ברק', 'marketing', 18000, 200, 0, 0, true),
(2, 'כנס הכוונה – אשדוד', '2026-09-20', '16:00', 'מרכז קהילתי אשדוד', 'pending_approval', 8000, 80, 0, 0, false),
(3, 'סמינר כלים מעשיים', '2026-08-10', '18:00', 'מרכז נתיבים ת"א', 'done', 5000, 45, 52, 31, true);

-- Seed: Expenses
insert into expenses (event_id, description, vendor, amount, date, status, category) values
(1, 'השכרת ציוד הגברה', 'סאונד מאסטר', 3500, '2026-09-10', 'paid', 'equipment'),
(1, 'הדפסת חומרי שיווק', 'ניאון גרפיקס', 1200, '2026-09-08', 'paid', 'marketing'),
(3, 'כיבוד ומשקאות', 'קייטרינג טעמים', 2800, '2026-08-09', 'paid', 'catering'),
(3, 'שכירות אולם', 'מרכז נתיבים', 2000, '2026-08-08', 'paid', 'venue');
