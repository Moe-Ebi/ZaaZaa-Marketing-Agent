// ============================================================================
// Content item service — CRUD + state transitions for the pipeline & dashboard.
// ----------------------------------------------------------------------------
// Writes go through the service-role admin client (the pipeline runs as a job).
// The DB trigger enforces valid state transitions, so transitionState() simply
// performs the UPDATE and surfaces any rejection as an error.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import type { ContentItem, ContentState, ContentVariant, PlanOutput } from './types';
import type { ScriptOutput, Platform } from '@/lib/adapters/generation';

const SELECT =
  'id, organization_id, state, product_id, format, hook_angle, plan, script, image_url, video_url, voiceover_url, final_video_urls, caption, platforms, approved_at, approved_by_user_id, rejected_at, rejection_reason, scheduled_at, published_at, error, created_at, updated_at';

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
  caption: string | null;
  platforms: unknown;
  approved_at: string | null;
  approved_by_user_id: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  scheduled_at: string | null;
  published_at: string | null;
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
    caption: r.caption,
    platforms: Array.isArray(r.platforms) ? (r.platforms as Platform[]) : [],
    approvedAt: r.approved_at,
    approvedByUserId: r.approved_by_user_id,
    rejectedAt: r.rejected_at,
    rejectionReason: r.rejection_reason,
    scheduledAt: r.scheduled_at,
    publishedAt: r.published_at,
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

/** List a tenant's items filtered to the given states. */
export async function listItemsByState(
  organizationId: number,
  states: ContentState[],
  limit = 100,
): Promise<ContentItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('content_items')
    .select(SELECT)
    .eq('organization_id', organizationId)
    .in('state', states)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list items by state: ${error.message}`);
  return (data ?? []).map((r) => toItem(r as Row));
}

/** Verify an item belongs to the tenant (guards every operator action). */
export async function assertItemOrg(id: number, organizationId: number): Promise<ContentItem> {
  const item = await getContentItem(id);
  if (!item || item.organizationId !== organizationId) {
    throw new Error('Content item not found for this tenant');
  }
  return item;
}

/** Merge edits into an item's script (hook/body/cta/hashtags) and caption. */
export async function updateItemContent(
  id: number,
  updates: { hook?: string; body?: string; cta?: string; hashtags?: string[]; caption?: string },
): Promise<ContentItem> {
  const current = await getContentItem(id);
  if (!current) throw new Error('Content item not found');
  const script = { ...(current.script as Record<string, unknown>) };
  if (updates.hook !== undefined) script.hook = updates.hook;
  if (updates.body !== undefined) script.body = updates.body;
  if (updates.cta !== undefined) script.cta = updates.cta;
  if (updates.hashtags !== undefined) script.hashtags = updates.hashtags;

  const admin = createAdminClient();
  const patch: Record<string, unknown> = { script };
  if (updates.caption !== undefined) patch.caption = updates.caption;
  const { data, error } = await admin
    .from('content_items')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw new Error(`Failed to update content: ${error.message}`);
  return toItem(data as Row);
}

export async function approveItem(
  id: number,
  approvedByUserId: string,
  opts: { caption?: string; platforms?: Platform[] } = {},
): Promise<ContentItem> {
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    state: 'approved',
    approved_at: new Date().toISOString(),
    approved_by_user_id: approvedByUserId,
    rejected_at: null,
    rejection_reason: null,
  };
  if (opts.caption !== undefined) patch.caption = opts.caption;
  if (opts.platforms !== undefined) patch.platforms = opts.platforms;
  const { data, error } = await admin
    .from('content_items')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw new Error(`Failed to approve item: ${error.message}`);
  return toItem(data as Row);
}

export async function rejectItem(id: number, reason: string): Promise<ContentItem> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('content_items')
    .update({ state: 'failed_retryable', rejected_at: new Date().toISOString(), rejection_reason: reason })
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw new Error(`Failed to reject item: ${error.message}`);
  return toItem(data as Row);
}

export async function scheduleItem(
  id: number,
  scheduledAt: string,
  platforms?: Platform[],
): Promise<ContentItem> {
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { state: 'scheduled', scheduled_at: scheduledAt };
  if (platforms !== undefined) patch.platforms = platforms;
  const { data, error } = await admin
    .from('content_items')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw new Error(`Failed to schedule item: ${error.message}`);
  return toItem(data as Row);
}

export async function listVariants(contentItemId: number): Promise<ContentVariant[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('content_variants')
    .select('id, content_item_id, variant_type, hook, script, image_url, performance_metrics')
    .eq('content_item_id', contentItemId)
    .order('variant_type');
  if (error) throw new Error(`Failed to list variants: ${error.message}`);
  return (data ?? []).map((v) => ({
    id: v.id as number,
    contentItemId: v.content_item_id as number,
    variantType: v.variant_type as string,
    hook: v.hook as string | null,
    script: (v.script ?? {}) as ContentVariant['script'],
    imageUrl: v.image_url as string | null,
    performanceMetrics: (v.performance_metrics ?? {}) as Record<string, unknown>,
  }));
}

/** All variants for a tenant, grouped by content_item_id (for history deep-dive). */
export async function listVariantsByOrg(
  organizationId: number,
): Promise<Record<number, ContentVariant[]>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('content_variants')
    .select('id, content_item_id, variant_type, hook, script, image_url, performance_metrics')
    .eq('organization_id', organizationId);
  if (error) throw new Error(`Failed to list variants: ${error.message}`);
  const grouped: Record<number, ContentVariant[]> = {};
  for (const v of data ?? []) {
    const key = v.content_item_id as number;
    (grouped[key] ??= []).push({
      id: v.id as number,
      contentItemId: key,
      variantType: v.variant_type as string,
      hook: v.hook as string | null,
      script: (v.script ?? {}) as ContentVariant['script'],
      imageUrl: v.image_url as string | null,
      performanceMetrics: (v.performance_metrics ?? {}) as Record<string, unknown>,
    });
  }
  return grouped;
}

export type { ContentItem, ContentState, ContentVariant } from './types';
