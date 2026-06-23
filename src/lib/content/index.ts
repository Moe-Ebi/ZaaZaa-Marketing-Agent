// ============================================================================
// Content item service — CRUD + state transitions for the pipeline & dashboard.
// ----------------------------------------------------------------------------
// Writes go through the service-role admin client (the pipeline runs as a job).
// The DB trigger enforces valid state transitions, so transitionState() simply
// performs the UPDATE and surfaces any rejection as an error.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import type { ContentItem, ContentState, PlanOutput } from './types';
import type { ScriptOutput, Platform } from '@/lib/adapters/generation';

const SELECT =
  'id, organization_id, state, product_id, format, hook_angle, plan, script, image_url, video_url, voiceover_url, final_video_urls, error, created_at, updated_at';

interface Row {
  id: number;
  organization_id: number;
  state: ContentState;
  product_id: number | null;
  format: string | null;
  hook_angle: string | null;
  plan: unknown;
  script: unknown;
  image_url: string | null;
  video_url: string | null;
  voiceover_url: string | null;
  final_video_urls: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
}

function toItem(r: Row): ContentItem {
  return {
    id: r.id,
    organizationId: r.organization_id,
    state: r.state,
    productId: r.product_id,
    format: r.format,
    hookAngle: r.hook_angle,
    plan: (r.plan ?? {}) as ContentItem['plan'],
    script: (r.script ?? {}) as ContentItem['script'],
    imageUrl: r.image_url,
    videoUrl: r.video_url,
    voiceoverUrl: r.voiceover_url,
    finalVideoUrls: (r.final_video_urls ?? {}) as Partial<Record<Platform, string>>,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Create a fresh draft content item for a tenant. */
export async function createDraft(organizationId: number, productId?: number): Promise<ContentItem> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('content_items')
    .insert({ organization_id: organizationId, state: 'draft', product_id: productId ?? null })
    .select(SELECT)
    .single();
  if (error) throw new Error(`Failed to create content item: ${error.message}`);
  return toItem(data as Row);
}

/** Transition an item to a new state (DB trigger validates the move). */
export async function transitionState(
  id: number,
  state: ContentState,
  patch: Partial<{
    format: string;
    hookAngle: string;
    plan: PlanOutput;
    script: ScriptOutput;
    imageUrl: string | null;
    videoUrl: string | null;
    voiceoverUrl: string | null;
    finalVideoUrls: Partial<Record<Platform, string>>;
    error: string | null;
  }> = {},
): Promise<ContentItem> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = { state };
  if (patch.format !== undefined) update.format = patch.format;
  if (patch.hookAngle !== undefined) update.hook_angle = patch.hookAngle;
  if (patch.plan !== undefined) update.plan = patch.plan;
  if (patch.script !== undefined) update.script = patch.script;
  if (patch.imageUrl !== undefined) update.image_url = patch.imageUrl;
  if (patch.videoUrl !== undefined) update.video_url = patch.videoUrl;
  if (patch.voiceoverUrl !== undefined) update.voiceover_url = patch.voiceoverUrl;
  if (patch.finalVideoUrls !== undefined) update.final_video_urls = patch.finalVideoUrls;
  if (patch.error !== undefined) update.error = patch.error;

  const { data, error } = await admin
    .from('content_items')
    .update(update)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw new Error(`Failed to transition item ${id} -> ${state}: ${error.message}`);
  return toItem(data as Row);
}

export async function addVariant(params: {
  contentItemId: number;
  organizationId: number;
  variantType: string;
  hook: string;
  script: ScriptOutput;
  imageUrl?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('content_variants').insert({
    content_item_id: params.contentItemId,
    organization_id: params.organizationId,
    variant_type: params.variantType,
    hook: params.hook,
    script: params.script,
    image_url: params.imageUrl ?? null,
  });
  if (error) throw new Error(`Failed to add variant: ${error.message}`);
}

export async function getContentItem(id: number): Promise<ContentItem | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('content_items').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to read content item: ${error.message}`);
  return data ? toItem(data as Row) : null;
}

export async function listContentItems(organizationId: number, limit = 50): Promise<ContentItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('content_items')
    .select(SELECT)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list content items: ${error.message}`);
  return (data ?? []).map((r) => toItem(r as Row));
}

export type { ContentItem, ContentState } from './types';
