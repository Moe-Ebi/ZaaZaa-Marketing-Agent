-- ============================================================================
-- Module 10 — Strategic planning (3-month marketing plans)
-- ----------------------------------------------------------------------------
-- A marketing_plan holds 3 months of plan_sections (month × week), each with
-- planned_content_items that, once the plan is approved, feed the Module 6
-- content pipeline (skipping SENSE/PLAN). Tenant-scoped; RLS on the parent plan
-- and via parent joins on the children.
-- ============================================================================

create table if not exists public.marketing_plans (
  id                   bigint generated always as identity primary key,
  organization_id      bigint not null references public.organizations(id) on delete cascade,
  name                 text not null,
  season               text,
  start_date           date not null,
  end_date             date not null,
  status               text not null default 'draft'
                         check (status in ('draft', 'pending_review', 'approved', 'active')),
  context              jsonb not null default '{}'::jsonb,  -- inputs: focus, tier, catalog snapshot
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  approved_at          timestamptz,
  approved_by_user_id  uuid references public.users(id) on delete set null
);

create index if not exists marketing_plans_org_status_idx
  on public.marketing_plans (organization_id, status);

create table if not exists public.plan_sections (
  id                   bigint generated always as identity primary key,
  plan_id              bigint not null references public.marketing_plans(id) on delete cascade,
  month                integer not null check (month between 1 and 3),
  week                 integer not null check (week between 1 and 4),
  theme                text,
  product_external_ids jsonb not null default '[]'::jsonb,  -- string[]
  key_hooks            jsonb not null default '[]'::jsonb,   -- string[]
  script_outline       text,
  hashtag_strategy     text,
  created_at           timestamptz not null default now()
);

create index if not exists plan_sections_plan_month_idx
  on public.plan_sections (plan_id, month);

create table if not exists public.planned_content_items (
  id                     bigint generated always as identity primary key,
  plan_section_id        bigint not null references public.plan_sections(id) on delete cascade,
  format                 text not null check (format in ('carousel', 'reel', 'story', 'single')),
  hook                   text,
  full_script            text,
  platforms              jsonb not null default '[]'::jsonb, -- Platform[]
  scheduled_date         date,
  status                 text not null default 'planned'
                           check (status in ('planned', 'generating', 'ready_for_review', 'linked_to_content_item')),
  linked_content_item_id bigint references public.content_items(id) on delete set null,
  created_at             timestamptz not null default now()
);

create index if not exists planned_content_items_section_idx
  on public.planned_content_items (plan_section_id);

-- ----------------------------------------------------------------------------
-- RLS — parent plan scoped by org; children scoped via parent joins
-- ----------------------------------------------------------------------------
alter table public.marketing_plans enable row level security;
drop policy if exists "marketing_plans tenant read" on public.marketing_plans;
create policy "marketing_plans tenant read"
  on public.marketing_plans for select to authenticated
  using (organization_id in (select public.user_organization_ids()));

alter table public.plan_sections enable row level security;
drop policy if exists "plan_sections tenant read" on public.plan_sections;
create policy "plan_sections tenant read"
  on public.plan_sections for select to authenticated
  using (plan_id in (
    select id from public.marketing_plans
    where organization_id in (select public.user_organization_ids())
  ));

alter table public.planned_content_items enable row level security;
drop policy if exists "planned_content_items tenant read" on public.planned_content_items;
create policy "planned_content_items tenant read"
  on public.planned_content_items for select to authenticated
  using (plan_section_id in (
    select ps.id from public.plan_sections ps
    join public.marketing_plans mp on ps.plan_id = mp.id
    where mp.organization_id in (select public.user_organization_ids())
  ));

-- updated_at on marketing_plans (reuse the Module 2 trigger fn)
drop trigger if exists marketing_plans_set_updated_at on public.marketing_plans;
create trigger marketing_plans_set_updated_at
  before update on public.marketing_plans
  for each row execute function public.set_updated_at();

-- Writes are service-role only (planning adapter via admin client).
