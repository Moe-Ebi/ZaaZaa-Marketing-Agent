-- ============================================================================
-- Module 3 — WooCommerce products cache
-- ----------------------------------------------------------------------------
-- Products synced from each tenant's WooCommerce store. The cache lets the app
-- serve product-aware features without hitting WooCommerce on every request
-- (Rule 4 keeps the slow sync in Inngest). Tenant-scoped + RLS per the Module 1
-- pattern.
-- ============================================================================

create table if not exists public.products (
  id               bigint generated always as identity primary key,
  organization_id  bigint not null references public.organizations(id) on delete cascade,
  woocommerce_id   bigint not null,
  title            text not null,
  description      text,
  image_url        text,
  price            numeric,
  stock_level      integer,
  stock_status     text,
  category         text,
  total_sales      integer not null default 0,  -- drives bestsellers
  woo_created_at   timestamptz,                 -- WooCommerce date_created (new arrivals)
  created_at       timestamptz not null default now(),
  synced_at        timestamptz not null default now(),
  unique (organization_id, woocommerce_id)
);

create index if not exists products_org_idx on public.products (organization_id);
create index if not exists products_org_sales_idx
  on public.products (organization_id, total_sales desc);
create index if not exists products_org_created_idx
  on public.products (organization_id, woo_created_at desc);

-- keep synced_at fresh on update (reuses the Module 2 trigger fn but for synced_at)
create or replace function public.set_products_synced_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_synced_at on public.products;
create trigger products_set_synced_at
  before update on public.products
  for each row execute function public.set_products_synced_at();

-- ----------------------------------------------------------------------------
-- RLS — tenant-scoped read (same pattern as every other table)
-- ----------------------------------------------------------------------------
alter table public.products enable row level security;

drop policy if exists "products tenant read" on public.products;
create policy "products tenant read"
  on public.products
  for select
  to authenticated
  using (organization_id in (select public.user_organization_ids()));

-- Writes are service-role only (the Inngest sync job upserts via admin client).
