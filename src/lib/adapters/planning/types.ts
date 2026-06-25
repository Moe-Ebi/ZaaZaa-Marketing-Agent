import { z } from 'zod';

export type PlanningResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PlanFormat = 'carousel' | 'reel' | 'story' | 'single';
export type PlanPlatform = 'instagram' | 'tiktok' | 'facebook';

// The structured shape Claude returns (validated with Zod after parsing).
export const PlanItemSchema = z.object({
  format: z.enum(['carousel', 'reel', 'story', 'single']),
  hook: z.string(),
  full_script: z.string(),
  platforms: z.array(z.enum(['instagram', 'tiktok', 'facebook'])),
  scheduled_offset_days: z.number().int(), // days from plan start_date
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const PlanWeekSchema = z.object({
  week: z.number().int(),
  theme: z.string(),
  product_external_ids: z.array(z.string()),
  key_hooks: z.array(z.string()),
  script_outline: z.string(),
  hashtag_strategy: z.string(),
  items: z.array(PlanItemSchema),
});
export type PlanWeek = z.infer<typeof PlanWeekSchema>;

export const PlanMonthSchema = z.object({
  month: z.number().int(),
  theme: z.string(),
  weeks: z.array(PlanWeekSchema),
});
export type PlanMonth = z.infer<typeof PlanMonthSchema>;

export const PlanGenerationSchema = z.object({
  plan_name: z.string(),
  months: z.array(PlanMonthSchema),
});
export type PlanGeneration = z.infer<typeof PlanGenerationSchema>;

// Catalog passed into the generator (SENSE signals for the plan).
export interface CatalogProduct {
  externalId: string;
  name: string;
  price: number;
  signal?: 'bestseller' | 'new_arrival' | 'low_stock';
}
export interface Catalog {
  bestsellers: CatalogProduct[];
  newArrivals: CatalogProduct[];
  all: CatalogProduct[];
}

export type BudgetTier = 'small' | 'medium' | 'large';
