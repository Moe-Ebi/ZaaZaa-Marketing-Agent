import type { ScriptOutput, Platform } from '@/lib/adapters/generation';

export type ContentState =
  | 'draft'
  | 'generating'
  | 'ready_for_review'
  | 'waiting_for_credits'
  | 'failed_retryable'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'analyzed';

export type ContentFormat = 'reel' | 'story' | 'tiktok' | 'carousel';

export interface PlanOutput {
  format: ContentFormat;
  product_external_id: string; // WooCommerce id of the product to feature
  hook_angle: string;
  rationale: string;
  variants: { variant_type: string; hook: string }[]; // A/B hooks
}

export interface ContentItem {
  id: number;
  organizationId: number;
  state: ContentState;
  productId: number | null;
  format: string | null;
  hookAngle: string | null;
  plan: PlanOutput | Record<string, never>;
  script: ScriptOutput | Record<string, never>;
  imageUrl: string | null;
  videoUrl: string | null;
  voiceoverUrl: string | null;
  finalVideoUrls: Partial<Record<Platform, string>>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
