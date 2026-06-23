-- ============================================================================
-- Module 6 — Content pipeline (items, variants, state machine)
-- ----------------------------------------------------------------------------
-- content_items move through an explicit state machine; a trigger enforces only
-- valid transitions. A/B hook variants live in content_variants. Tenant-scoped
-- + RLS per the Module 1 pattern (operators may read + edit their own items).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'content_state') then
    create type public.content_state as enum (
      'draft',
      'generating',
      'ready_for_review',
      'waiting_for_credits',  -- AI image/video blocked (e.g. no Higgsfield credits)
      'failed_retryable',     -- transient error; safe to re-run
      'approved',
      'scheduled',
      'published',
      'analyzed'
    );
  end if;
end$$;

create table if not exists public.content_items (
  id                bigint generated always as identity primary key,
  organization_id   bigint not null references public.organizations(id) on delete cascade,
  state             public.content_state not null default 'draft',
  product_id        bigint references public.products(id) on delete set null,
  format            text,                         -- reel, story, tiktok, carousel
  hook_angle        text,                         -- "FOMO", "benefit-driven", …
  plan              jsonb not null default '{}'::jsonb,  -- raw PLAN output
  script            jsonb not null default '{}'::jsonb,  -- chosen ScriptOutput
  image_url         text,
  video_url         text,
  voiceover_url     text,
  final_video_urls  jsonb not null default '{}'::jsonb,  -- { instagram, tiktok, facebook }
  error             text,                         -- last failure reason, if any
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists content_items_org_idx
  on public.content_items (organization_id, created_at desc);
create index if not exists content_items_state_idx
  on public.content_items (organization_id, state);

create table if not exists public.content_variants (
  id                  bigint generated always as identity primary key,
  content_item_id     bigint not null references public.content_items(id) on delete cascade,
  organization_id     bigint not null references public.organizations(id) on delete cascade,
  variant_type        text not null,             -- a_hook, b_hook, …
  hook                text,
  script              jsonb not null default '{}'::jsonb,
  image_url           text,
  performance_metrics jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists content_variants_item_idx
  on public.content_variants (content_item_id);

-- ----------------------------------------------------------------------------
-- State-machine enforcement: reject invalid transitions on UPDATE.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_content_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  if new.state = old.state then
    return new; -- no state change; allow other column edits
  end if;

  ok := case old.state
    when 'draft'               then new.state in ('generating')
    when 'generating'          then new.state in ('ready_for_review', 'waiting_for_credits', 'failed_retryable')
    when 'waiting_for_credits' then new.state in ('generating')
    when 'failed_retryable'    then new.state in ('generating')
    when 'ready_for_review'    then new.state in ('approved', 'generating')
    when 'approved'            then new.state in ('scheduled', 'ready_for_review')
    when 'scheduled'           then new.state in ('published', 'approved')
    when 'published'           then new.state in ('analyzed')
    when 'analyzed'            then false
    else false
  end;

  if not ok then
    raise exception 'Invalid content_items state transition: % -> %', old.state, new.state;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists content_items_state_transition on public.content_items;
create trigger content_items_state_transition
  before update on public.content_items
  for each row execute function public.enforce_content_state_transition();

-- ----------------------------------------------------------------------------
-- RLS — tenant read + edit (operators review/approve in Module 7)
-- ----------------------------------------------------------------------------
alter table public.content_items enable row level security;

drop policy if exists "content_items tenant read" on public.content_items;
create policy "content_items tenant read"
  on public.content_items for select to authenticated
  using (organization_id in (select public.user_organization_ids()));

drop policy if exists "content_items tenant update" on public.content_items;
create policy "content_items tenant update"
  on public.content_items for update to authenticated
  using (organization_id in (select public.user_organization_ids()))
  with check (organization_id in (select public.user_organization_ids()));

alter table public.content_variants enable row level security;

drop policy if exists "content_variants tenant read" on public.content_variants;
create policy "content_variants tenant read"
  on public.content_variants for select to authenticated
  using (organization_id in (select public.user_organization_ids()));

-- Inserts (pipeline) run via the service role, which bypasses RLS.
