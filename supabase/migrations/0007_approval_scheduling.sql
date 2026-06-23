-- ============================================================================
-- Module 7 — Approval, scheduling & history fields on content_items
-- ----------------------------------------------------------------------------
-- Adds the human-control columns (approval, rejection, scheduling, publishing,
-- platform selection, editable caption) and widens the state machine so a
-- ready_for_review item can be rejected (→ failed_retryable, with a reason).
-- RLS is unchanged — still org-scoped from Module 6.
-- ============================================================================

alter table public.content_items
  add column if not exists caption              text,
  add column if not exists approved_at          timestamptz,
  add column if not exists approved_by_user_id  uuid references public.users(id) on delete set null,
  add column if not exists rejected_at          timestamptz,
  add column if not exists rejection_reason     text,
  add column if not exists scheduled_at         timestamptz,
  add column if not exists published_at         timestamptz,
  add column if not exists platforms            jsonb not null default '[]'::jsonb;

create index if not exists content_items_scheduled_idx
  on public.content_items (organization_id, scheduled_at)
  where scheduled_at is not null;

-- Allow rejection from the review queue (ready_for_review -> failed_retryable).
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
    when 'approved'            then new.state in ('scheduled', 'ready_for_review', 'published')
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
