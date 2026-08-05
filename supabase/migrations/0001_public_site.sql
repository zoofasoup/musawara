-- Musawara — Phase 1: tables backing the public site.
--
-- Design notes:
--   * Every table has RLS enabled. Anonymous visitors can read ONLY rows
--     flagged is_published. Nothing is visible by default.
--   * `clients` is deliberately shaped exactly as spec §8 describes it, so the
--     Phase 2 admin tables (brand_core, voice_profiles, offers, objections,
--     compliance_rules, creative_wins, assets) hang off it without a rewrite.
--   * Two spec rules are enforced as CHECK constraints rather than as review
--     discipline: a metric cannot be published unverified (§6.2), and a job
--     opening cannot be published without a salary range (§6.5).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- utilities

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------------ clients

create table clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  category    text,
  one_liner   text,
  logo_url    text,
  status      text not null default 'active'
                check (status in ('active', 'paused', 'archived')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ----------------------------------------------------------- ledger entries

-- One row per claim on the home page hero ledger. A brand may have several.
--
-- outcome_kind splits the two things the ledger can assert:
--   'metric'    — a number moved. end_value holds the numeral.
--   'milestone' — something was cleared or shipped that has no numeral
--                 (NIE granted, halal certified, first route live).
--
-- Only 'metric' rows ever render marigold, which is what keeps §6.3's rule
-- true: the only gold thing on the page is a number.

create table ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  outcome_kind  text not null check (outcome_kind in ('metric', 'milestone')),

  start_value   text,          -- numeral only, e.g. '300'
  start_note    text,          -- qualifier, e.g. 'pengikut Instagram'
  end_value     text,          -- numeral only, e.g. '22.000'
  end_note      text,          -- qualifier, or the milestone itself
  period        text,          -- e.g. 'Jan 2025 – Jun 2026'

  -- Provenance. verified_at is set by hand once the owner has confirmed the
  -- figure against source data; source_note records where it came from.
  verified_at   timestamptz,
  source_note   text,

  is_published  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A metric row must carry a numeral.
  constraint metric_needs_value
    check (outcome_kind <> 'metric' or end_value is not null),

  -- Spec §6.2: "Confirm every number with the owner before publishing."
  -- An unverified metric physically cannot be published.
  constraint published_metric_must_be_verified
    check (
      not is_published
      or outcome_kind <> 'metric'
      or verified_at is not null
    )
);

create index ledger_entries_published_idx
  on ledger_entries (is_published, sort_order);

create trigger ledger_entries_updated_at
  before update on ledger_entries
  for each row execute function set_updated_at();

-- ------------------------------------------------------------ case studies

create table case_studies (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  slug          text unique not null,
  title         text not null,
  summary       text,
  body          text,          -- markdown
  is_published  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index case_studies_published_idx
  on case_studies (is_published, sort_order);

create trigger case_studies_updated_at
  before update on case_studies
  for each row execute function set_updated_at();

-- ------------------------------------------------------------ job openings

create table job_openings (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  title             text not null,
  employment_type   text not null
                      check (employment_type in ('PKWT', 'PKWTT', 'Magang', 'Freelance')),
  location          text not null,
  work_arrangement  text not null
                      check (work_arrangement in ('onsite', 'hybrid', 'remote')),
  week_one          text,        -- markdown: what this person does in week one
  tools             text[] not null default '{}',
  salary_min        numeric,
  salary_max        numeric,
  salary_period     text not null default 'bulan',
  question_prompt   text,        -- the role-specific free-text question
  is_published      boolean not null default false,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint salary_range_ordered
    check (salary_min is null or salary_max is null or salary_min <= salary_max),

  -- Spec §6.5: "Publish the range." A role without one cannot go live.
  constraint published_role_must_show_salary
    check (
      not is_published
      or (salary_min is not null and salary_max is not null)
    )
);

create index job_openings_published_idx
  on job_openings (is_published, sort_order);

create trigger job_openings_updated_at
  before update on job_openings
  for each row execute function set_updated_at();

-- -------------------------------------------------------- job applications

create table job_applications (
  id               uuid primary key default gen_random_uuid(),
  job_opening_id   uuid references job_openings(id) on delete set null,
  full_name        text not null,
  email            text not null,
  whatsapp         text not null,
  portfolio_url    text,
  answer           text,
  created_at       timestamptz not null default now()
);

create index job_applications_created_idx
  on job_applications (created_at desc);

-- ---------------------------------------------------------------------- RLS

alter table clients           enable row level security;
alter table ledger_entries    enable row level security;
alter table case_studies      enable row level security;
alter table job_openings      enable row level security;
alter table job_applications  enable row level security;

-- Public read: only what has been deliberately published.

create policy "public reads active clients"
  on clients for select
  to anon, authenticated
  using (status = 'active');

create policy "public reads published ledger entries"
  on ledger_entries for select
  to anon, authenticated
  using (is_published);

create policy "public reads published case studies"
  on case_studies for select
  to anon, authenticated
  using (is_published);

create policy "public reads published job openings"
  on job_openings for select
  to anon, authenticated
  using (is_published);

-- Applications are write-only from the public site. Anyone may apply;
-- nobody anonymous may read what anyone else submitted.
create policy "anyone may submit an application"
  on job_applications for insert
  to anon, authenticated
  with check (true);

-- No select/update/delete policy on job_applications: reads happen through
-- the service role (Phase 2 admin) only.
