-- ============================================================================
-- Module 1 — Multi-tenancy & Auth
-- ----------------------------------------------------------------------------
-- CLAUDE.md Rule 2: every table is tenant-scoped (organization_id) and every
-- query is enforced by Row-Level Security. This migration establishes:
--   1. The tenant backbone tables (organizations, users, organization_members)
--   2. An auth trigger that mirrors auth.users -> public.users on signup
--   3. Recursion-safe SECURITY DEFINER helpers used by every RLS policy
--   4. The reusable RLS pattern, applied to all three tables
-- All downstream modules add tables that follow the SAME pattern (see §below).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

-- organizations = tenants. A single brand (Zaazaa) is just tenant #1.
create table if not exists public.organizations (
  id            bigint generated always as identity primary key,
  name          text   not null,
  slug          text   not null unique,
  -- hybrid SaaS flag: false = single-tenant deployment, true = multi-tenant pool
  multi_tenant  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- users = mirror of auth.users (so we can FK to it and store app-level profile).
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now()
);

-- organization_members = membership join with role. This is the tenant edge:
-- a user "belongs to" a tenant iff a row exists here.
create table if not exists public.organization_members (
  id               bigint generated always as identity primary key,
  organization_id  bigint not null references public.organizations(id) on delete cascade,
  user_id          uuid   not null references public.users(id) on delete cascade,
  role             text   not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);
create index if not exists organization_members_org_id_idx
  on public.organization_members (organization_id);

-- ----------------------------------------------------------------------------
-- 2. AUTH TRIGGER — mirror auth.users into public.users on signup
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so the trigger can insert regardless of the caller's RLS.
-- search_path = '' + fully-qualified names per Supabase security guidance.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. RECURSION-SAFE RLS HELPERS
-- ----------------------------------------------------------------------------
-- Policies on organization_members must NOT query organization_members through
-- RLS (infinite recursion). These SECURITY DEFINER functions read the table
-- with RLS bypassed, returning only the current user's scope. Every policy
-- below is expressed in terms of these helpers — this IS the reusable pattern.

-- The set of organization (tenant) ids the current user belongs to.
create or replace function public.user_organization_ids()
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.organization_members
  where user_id = (select auth.uid());
$$;

-- The set of user ids that share at least one organization with the current
-- user (includes the user themselves). Used to scope the users table.
create or replace function public.user_co_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m2.user_id
  from public.organization_members m1
  join public.organization_members m2
    on m1.organization_id = m2.organization_id
  where m1.user_id = (select auth.uid());
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS POLICIES — the reusable pattern, applied to every table
-- ----------------------------------------------------------------------------
-- Pattern for any tenant-scoped table T with an organization_id column:
--   alter table T enable row level security;
--   create policy "T tenant read" on T for select to authenticated
--     using (organization_id in (select public.user_organization_ids()));
-- Writes for tenant-management tables are operator-managed (service role only)
-- in Phase 1; the service role bypasses RLS. Downstream content tables will add
-- authenticated write policies following the same organization_id check.

-- organizations -------------------------------------------------------------
alter table public.organizations enable row level security;

drop policy if exists "organizations tenant read" on public.organizations;
create policy "organizations tenant read"
  on public.organizations
  for select
  to authenticated
  using (id in (select public.user_organization_ids()));

-- users ---------------------------------------------------------------------
alter table public.users enable row level security;

drop policy if exists "users co-member read" on public.users;
create policy "users co-member read"
  on public.users
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or id in (select public.user_co_member_ids())
  );

-- a user may update their own profile row
drop policy if exists "users update own" on public.users;
create policy "users update own"
  on public.users
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organization_members ------------------------------------------------------
alter table public.organization_members enable row level security;

drop policy if exists "members tenant read" on public.organization_members;
create policy "members tenant read"
  on public.organization_members
  for select
  to authenticated
  using (organization_id in (select public.user_organization_ids()));

-- ============================================================================
-- NOTE: organizations / users / organization_members have NO insert/delete
-- policies for the `authenticated` role on purpose. Tenant provisioning and
-- membership are operator-managed in Phase 1 and run via the service role,
-- which bypasses RLS. When self-serve org creation arrives, add scoped
-- insert policies here following the same user_organization_ids() pattern.
-- ============================================================================
