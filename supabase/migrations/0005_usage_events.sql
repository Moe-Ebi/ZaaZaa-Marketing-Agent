-- ============================================================================
-- Module 5 — Usage metering (Rule 5)
-- ----------------------------------------------------------------------------
-- Every billable generation call records a usage_event, even in the MVP before
-- we charge. Module 10 (billing) reads this to enforce tier allowances and bill
-- overages. Tenant-scoped + RLS per the Module 1 pattern.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'generation_event_type') then
    create type public.generation_event_type as enum (
      'script',
      'caption',
      'image',
      'video',
      'voiceover',
      'assembly'
    );
  end if;
end$$;

create table if not exists public.usage_events (
  id                       bigint generated always as identity primary key,
  organization_id          bigint not null references public.organizations(id) on delete cascade,
  event_type               public.generation_event_type not null,
  -- the primary metric: tokens (script), credits (image/video), characters
  -- (voiceover), or seconds (assembly)
  tokens_or_credits_used   numeric not null default 0,
  cost_estimate            numeric not null default 0,  -- USD estimate
  detail                   text,
  created_at               timestamptz not null default now()
);

create index if not exists usage_events_org_idx
  on public.usage_events (organization_id, created_at desc);

alter table public.usage_events enable row level security;

drop policy if exists "usage_events tenant read" on public.usage_events;
create policy "usage_events tenant read"
  on public.usage_events
  for select
  to authenticated
  using (organization_id in (select public.user_organization_ids()));

-- Writes are service-role only (the generation adapters record via admin client).

-- ----------------------------------------------------------------------------
-- Storage bucket for generated assets (e.g. OpenAI TTS audio we host ourselves).
-- Vendor-hosted assets (Higgsfield images/videos, Shotstack MP4s) keep their own
-- URLs; only self-produced bytes land here. Public bucket = readable by URL.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('generated', 'generated', true)
on conflict (id) do nothing;
