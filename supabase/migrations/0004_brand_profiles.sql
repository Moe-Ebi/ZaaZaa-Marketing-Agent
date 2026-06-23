-- ============================================================================
-- Module 4 — Brand profiles & voice
-- ----------------------------------------------------------------------------
-- One brand profile per tenant: visual identity + the structured voice_profile
-- that OpenAI distills from the brand's past content + guidelines. This is the
-- source of truth every downstream generation reads (Module 5+). Tenant-scoped
-- + RLS per the Module 1 pattern.
-- ============================================================================

create table if not exists public.brand_profiles (
  id               bigint generated always as identity primary key,
  organization_id  bigint not null references public.organizations(id) on delete cascade,
  brand_name       text,
  brand_colors     jsonb not null default '[]'::jsonb,   -- e.g. ["#111","#eee"] or [{name,hex}]
  logo_url         text,
  target_audience  text,
  do_rules         jsonb not null default '[]'::jsonb,    -- string[]
  dont_rules       jsonb not null default '[]'::jsonb,    -- string[]
  -- voice_profile: { tone[], values[], personality, content_themes[],
  --                  audience_keywords[], prohibition_keywords[] }
  voice_profile    jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id)   -- one profile per tenant
);

create index if not exists brand_profiles_org_idx on public.brand_profiles (organization_id);

-- keep updated_at fresh (reuse the Module 2 set_updated_at trigger fn)
drop trigger if exists brand_profiles_set_updated_at on public.brand_profiles;
create trigger brand_profiles_set_updated_at
  before update on public.brand_profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — tenant-scoped read AND write (operator manages their own brand)
-- ----------------------------------------------------------------------------
alter table public.brand_profiles enable row level security;

drop policy if exists "brand_profiles tenant read" on public.brand_profiles;
create policy "brand_profiles tenant read"
  on public.brand_profiles
  for select
  to authenticated
  using (organization_id in (select public.user_organization_ids()));

-- Writes still go through the server (admin client) for OpenAI distillation +
-- validation, so we keep mutations service-role only for consistency with the
-- other modules. (The read policy lets the dashboard show the profile.)
