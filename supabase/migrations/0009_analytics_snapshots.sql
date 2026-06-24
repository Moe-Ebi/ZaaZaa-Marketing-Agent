-- ============================================================================
-- Module 9 — Analytics ingest
-- ----------------------------------------------------------------------------
-- Per-post performance snapshots pulled from Blotato on a cron. Tenant-scoped +
-- RLS. Also extends the usage enum so analytics pulls are metered (Rule 5/8).
-- ============================================================================

-- New metered event type for analytics pulls (safe: value not used in this tx).
alter type public.generation_event_type add value if not exists 'analytics_pull';

create table if not exists public.analytics_snapshots (
  id               bigint generated always as identity primary key,
  organization_id  bigint not null references public.organizations(id) on delete cascade,
  publication_id   bigint references public.publications(id) on delete set null,
  platform         text not null check (platform in ('instagram', 'tiktok', 'facebook')),
  snapshot_at      timestamptz not null default now(),
  followers        integer not null default 0,
  engagement_rate  numeric not null default 0,   -- 0..1
  reach            integer not null default 0,
  impressions      integer not null default 0,
  views            integer not null default 0,
  likes            integer not null default 0,
  comments         integer not null default 0,
  shares           integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists analytics_snapshots_dash_idx
  on public.analytics_snapshots (organization_id, platform, snapshot_at desc);
create index if not exists analytics_snapshots_pub_idx
  on public.analytics_snapshots (publication_id);

alter table public.analytics_snapshots enable row level security;

drop policy if exists "analytics tenant read" on public.analytics_snapshots;
create policy "analytics tenant read"
  on public.analytics_snapshots
  for select
  to authenticated
  using (organization_id in (select public.user_organization_ids()));

-- Writes are service-role only (the ingest cron via admin client).
