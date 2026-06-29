-- ============================================================================
-- Phase 2 — Brand customization center
-- ----------------------------------------------------------------------------
-- Extends brand_profiles (Module 4) with typography preference and example
-- "content we like / dislike" references. logo_url + brand_colors already exist.
-- ============================================================================

alter table public.brand_profiles
  add column if not exists typography       text,
  add column if not exists example_likes    jsonb not null default '[]'::jsonb,
  add column if not exists example_dislikes  jsonb not null default '[]'::jsonb;
