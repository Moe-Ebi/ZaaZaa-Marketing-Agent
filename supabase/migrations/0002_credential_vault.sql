-- ============================================================================
-- Module 2 — Credential Vault
-- ----------------------------------------------------------------------------
-- CLAUDE.md Rule 3: no secrets in code. Per-tenant client credentials live here,
-- encrypted at rest (AES-256-GCM, key in CREDENTIAL_ENCRYPTION_KEY env, never in
-- the DB). Every access is audited (POPIA). Tenant-scoped by organization_id and
-- enforced by RLS following the Module 1 pattern.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM — supported credential types
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'credential_type') then
    create type public.credential_type as enum (
      'woocommerce',
      'higgsfield',
      'shotstack',
      'openai',
      'publishing_wrapper'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'credential_audit_action') then
    create type public.credential_audit_action as enum (
      'create',
      'read',
      'view',     -- masked display (last 4 only)
      'update',
      'rotate',
      'refresh',
      'delete'
    );
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- 2. TABLES
-- ----------------------------------------------------------------------------

-- credentials — one active row per (org, type); rotation archives the old row.
-- encrypted_value packs version + nonce + auth tag + ciphertext as base64.
-- The plaintext NEVER touches this table.
create table if not exists public.credentials (
  id               bigint generated always as identity primary key,
  organization_id  bigint not null references public.organizations(id) on delete cascade,
  credential_type  public.credential_type not null,
  label            text,
  encrypted_value  text not null,
  status           text not null default 'active' check (status in ('active', 'archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- At most one active credential per (org, type).
create unique index if not exists credentials_one_active_per_type
  on public.credentials (organization_id, credential_type)
  where status = 'active';

create index if not exists credentials_org_idx on public.credentials (organization_id);

-- credential_audit_log — append-only record of every credential access (POPIA).
create table if not exists public.credential_audit_log (
  id               bigint generated always as identity primary key,
  organization_id  bigint not null references public.organizations(id) on delete cascade,
  credential_id    bigint references public.credentials(id) on delete set null,
  credential_type  public.credential_type,
  action           public.credential_audit_action not null,
  user_id          uuid references public.users(id) on delete set null,
  detail           text,
  created_at       timestamptz not null default now()
);

create index if not exists credential_audit_org_idx
  on public.credential_audit_log (organization_id, created_at desc);

-- keep updated_at fresh on credentials
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists credentials_set_updated_at on public.credentials;
create trigger credentials_set_updated_at
  before update on public.credentials
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. RLS — same tenant pattern as Module 1 (organization_id scoped)
-- ----------------------------------------------------------------------------
-- Note: RLS only gates row visibility. Even if a member reads a credential row,
-- they receive ciphertext only — decryption needs the server-side env key.
-- Vault writes + audit inserts run via the service role (trusted server code),
-- which bypasses RLS; these read policies let an authenticated operator list
-- their own tenant's credential metadata + audit trail in the admin UI.

alter table public.credentials enable row level security;

drop policy if exists "credentials tenant read" on public.credentials;
create policy "credentials tenant read"
  on public.credentials
  for select
  to authenticated
  using (organization_id in (select public.user_organization_ids()));

alter table public.credential_audit_log enable row level security;

drop policy if exists "audit tenant read" on public.credential_audit_log;
create policy "audit tenant read"
  on public.credential_audit_log
  for select
  to authenticated
  using (organization_id in (select public.user_organization_ids()));

-- ============================================================================
-- Writes (insert/update/delete) on both tables are intentionally service-role
-- only. All mutations go through the vault module (lib/vault) which encrypts,
-- writes, and records an audit entry atomically server-side.
-- ============================================================================
