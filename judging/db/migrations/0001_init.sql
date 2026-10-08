create extension if not exists pgcrypto;

create type event_phase as enum (
  'setup',
  'submissions_open',
  'submissions_closed',
  'judging_live',
  'judging_closed',
  'published',
  'archived'
);

create type track_kind as enum ('main', 'sponsor', 'special');

create type dispatch_strategy as enum ('coverage', 'uncertainty');

create type judge_status as enum ('invited', 'applied', 'approved', 'suspended');

create type comparison_outcome as enum ('a', 'b', 'tie');

create type membership_role as enum ('owner', 'admin', 'organizer', 'volunteer');

create table organization (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  branding jsonb not null default '{}'::jsonb
);

create table panel_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null
);

create table panel_event (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organization (id) on delete cascade,
  slug text not null,
  name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  phase event_phase not null default 'setup',
  unique (org_id, slug)
);

create table event_config (
  event_id uuid primary key references panel_event (id) on delete cascade,
  target_seconds integer not null,
  hard_limit_seconds integer not null,
  walk_limit_seconds integer not null,
  submit_grace_seconds integer not null,
  min_looks_per_project integer not null,
  dispatch_strategy dispatch_strategy not null,
  pairwise_enabled boolean not null default false,
  pairwise_weight numeric not null default 0,
  bayesian_c numeric not null default 2,
  calibration_looks integer not null default 0,
  calibration_weight numeric not null default 1,
  feedback_cards_enabled boolean not null default false,
  leaderboard_public boolean not null default false,
  board_poll_seconds integer not null default 5
);

create table rubric (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  name text not null,
  is_default boolean not null default false
);

create table criterion (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references rubric (id) on delete cascade,
  position integer not null,
  key text not null,
  label text not null,
  description text,
  min numeric not null,
  max numeric not null,
  weight numeric not null,
  anchors jsonb not null default '[]'::jsonb,
  unique (rubric_id, key)
);

create table track (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  slug text not null,
  name text not null,
  kind track_kind not null,
  judge_group text not null,
  rubric_id uuid references rubric (id),
  position integer not null default 0,
  is_active boolean not null default true,
  unique (event_id, slug)
);

create table prize (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references track (id) on delete cascade,
  place integer not null,
  title text not null,
  amount numeric,
  description text,
  unique (track_id, place)
);

create table zone (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  name text not null,
  position integer not null default 0
);

-- `table` is reserved in SQL, so the floor plan lives in floor_table.
create table floor_table (
  event_id uuid not null references panel_event (id) on delete cascade,
  number integer not null,
  zone_id uuid references zone (id),
  x numeric,
  y numeric,
  primary key (event_id, number)
);

create table project (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  external_id text,
  name text not null,
  description text,
  team_name text,
  members jsonb not null default '[]'::jsonb,
  links jsonb not null default '{}'::jsonb,
  table_number integer,
  zone_id uuid references zone (id),
  qr_token uuid not null unique default gen_random_uuid(),
  arrived_first_at timestamptz,
  withdrawn_at timestamptz
);

create unique index project_event_external_idx
  on project (event_id, external_id)
  where external_id is not null;

create table project_track (
  project_id uuid not null references project (id) on delete cascade,
  track_id uuid not null references track (id) on delete cascade,
  primary key (project_id, track_id)
);

create table panel_judge (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  external_id text,
  name text not null,
  email text not null,
  org text,
  title text,
  status judge_status not null default 'invited',
  track_id uuid references track (id),
  zone_id uuid references zone (id),
  is_lead boolean not null default false,
  unique (event_id, email)
);

create unique index judge_event_external_idx
  on panel_judge (event_id, external_id)
  where external_id is not null;

create table visit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  judge_id uuid not null references panel_judge (id) on delete cascade,
  project_id uuid not null references project (id) on delete cascade,
  judge_group text not null,
  handed_out_at timestamptz not null,
  arrived_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text
);

-- A completed look still counts: the same judge is not handed that project again.
create unique index visit_judge_project_open_idx
  on visit (judge_id, project_id)
  where voided_at is null;

-- One table in hand at a time. The dispatch lock is the first guard; this is the second.
create unique index visit_one_open_idx
  on visit (judge_id)
  where voided_at is null and completed_at is null;

create table vote (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references visit (id) on delete cascade,
  judge_id uuid not null references panel_judge (id) on delete cascade,
  project_id uuid not null references project (id) on delete cascade,
  event_id uuid not null references panel_event (id) on delete cascade,
  total numeric not null,
  comment text,
  duration_seconds integer,
  is_calibration boolean not null default false
);

create table vote_score (
  vote_id uuid not null references vote (id) on delete cascade,
  criterion_id uuid not null references criterion (id),
  value numeric not null,
  primary key (vote_id, criterion_id)
);

create table comparison (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  judge_id uuid not null references panel_judge (id) on delete cascade,
  judge_group text not null,
  a_project_id uuid not null references project (id),
  b_project_id uuid not null references project (id),
  outcome comparison_outcome not null,
  created_at timestamptz not null default now()
);

create table result_run (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  computed_at timestamptz not null default now(),
  computed_by uuid references panel_user (id),
  config_snapshot jsonb not null,
  published_at timestamptz,
  notes text
);

create table result (
  run_id uuid not null references result_run (id) on delete cascade,
  project_id uuid not null references project (id) on delete cascade,
  track_id uuid not null references track (id) on delete cascade,
  placement integer,
  score numeric not null,
  rubric_component numeric not null,
  pairwise_component numeric not null,
  vote_count integer not null,
  comparison_count integer not null,
  flags text[] not null default '{}',
  primary key (run_id, project_id, track_id)
);

create table event_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  kind text not null,
  actor jsonb not null default '{}'::jsonb,
  subject jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references panel_event (id) on delete cascade,
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempts integer not null default 0
);

create table webhook (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organization (id) on delete cascade,
  url text not null,
  secret text not null,
  topics text[] not null,
  is_active boolean not null default true
);

create table api_key (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organization (id) on delete cascade,
  hashed_key text not null,
  scopes text[] not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table membership (
  user_id uuid not null references panel_user (id) on delete cascade,
  org_id uuid not null references organization (id) on delete cascade,
  role membership_role not null,
  primary key (user_id, org_id)
);

create table judge_identity (
  judge_id uuid primary key references panel_judge (id) on delete cascade,
  user_id uuid not null references panel_user (id) on delete cascade
);

create table login_code (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index event_log_event_idx on event_log (event_id, created_at);
create index outbox_pending_idx on outbox (created_at) where delivered_at is null;
create index visit_event_idx on visit (event_id);
create index project_event_idx on project (event_id);
