-- ============================================================================
-- Module 11 — Lifestyle video generation
-- ----------------------------------------------------------------------------
-- Adds a metered event type for Higgsfield video generation and a per-planned-
-- item video strategy (carousel / lifestyle / product_motion).
-- ============================================================================

alter type public.generation_event_type add value if not exists 'video_generation_higgsfield';

alter table public.planned_content_items
  add column if not exists video_strategy text not null default 'carousel'
    check (video_strategy in ('carousel', 'lifestyle', 'product_motion'));
