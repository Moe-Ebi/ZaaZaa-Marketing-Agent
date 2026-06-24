-- ============================================================================
-- Module 8 — Publishing (wrapper-first via Blotato)
-- ----------------------------------------------------------------------------
-- One publications row per (content_item, platform) attempt. Tenant-scoped + RLS.
-- Also widens the state machine so a publish failure can move an item to
-- failed_retryable (from scheduled or approved).
-- ============================================================================

create table if not exists public.publications (
  id                bigint generated always as identity primary key,
  organization_id   bigint not null references public.organizations(id) on delete cascade,
  content_item_id   bigint not null references public.content_items(id) on delete cascade,
  platform          text not null check (platform in ('instagram', 'tiktok', 'facebook')),
  status            text not null default 'scheduled' check (status in ('scheduled', 'published', 'failed')),
  published_at      timestamptz,
  platform_post_id  text,
  error_message     text,
  created_at        timestamptz not null default now()
);

create index if not exists publications_org_idx on public.publications (organization_id, created_at desc);
create index if not exists publications_item_idx on public.publications (content_item_id);

alter table public.publications enable row level security;

drop policy if exists "publications tenant read" on public.publications;
create policy "publications tenant read"
  on public.publications
  for select
  to authenticated
  using (organization_id in (select public.user_organization_ids()));

-- Writes are service-role only (publishing adapter / cron via admin client).

-- Allow a publish failure to send an item to failed_retryable.
create or replace function public.enforce_content_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  if new.state = old.state then
    return new;
  end if;

  ok := case old.state
    when 'draft'               then new.state in ('generating')
    when 'generating'          then new.state in ('ready_for_review', 'waiting_for_credits', 'failed_retryable')
    when 'waiting_for_credits' then new.state in ('generating')
    when 'failed_retryable'    then new.state in ('generating')
    when 'ready_for_review'    then new.state in ('approved', 'generating', 'failed_retryable')
    when 'approved'            then new.state in ('scheduled', 'ready_for_review', 'published', 'failed_retryable')
    when 'scheduled'           then new.state in ('published', 'approved', 'failed_retryable')
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
