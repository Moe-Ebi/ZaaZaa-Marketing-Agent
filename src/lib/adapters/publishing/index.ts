// ============================================================================
// Publishing adapter (public interface) — wrapper-first via Blotato.
// ----------------------------------------------------------------------------
// Rule 1: the app calls these; it never touches Blotato directly. Per-tenant
// social account IDs live in the vault ('publishing_wrapper' credential, JSON);
// the platform API key is env. Each platform attempt writes a publications row.
// Captions are auto-formatted per platform and a compliance gate runs first.
// getAnalytics remains a stub for Module 9.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import { getCredentialJSON } from '@/lib/vault';
import type { ContentItem } from '@/lib/content/types';
import { publishPost as blotatoPublish, type PlatformTarget } from './blotato-client';

export type Platform = 'instagram' | 'tiktok' | 'facebook';
export type PublicationStatus = 'scheduled' | 'published' | 'failed';

export interface PublishingResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

// Per-tenant publishing config stored in the vault as 'publishing_wrapper'.
export interface PublishingAccounts {
  instagram?: { accountId: string };
  tiktok?: { accountId: string };
  facebook?: { accountId: string; pageId: string };
}

export interface PublicationRecord {
  id: number;
  organizationId: number;
  contentItemId: number;
  platform: Platform;
  status: PublicationStatus;
  publishedAt: string | null;
  platformPostId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

// --- caption formatting (per-platform rules) --------------------------------
const IG_MAX = 2_200;

function formatCaption(item: ContentItem, platform: Platform): string {
  const base = item.caption?.trim() || composeFromScript(item);
  if (platform === 'instagram') return base.slice(0, IG_MAX);
  // TikTok + Facebook are flexible; keep as-is (TikTok allows long + trending audio).
  return base;
}

function composeFromScript(item: ContentItem): string {
  const s = item.script as { hook?: string; body?: string; cta?: string; hashtags?: string[] };
  const tags = (s.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  return [s.hook, s.body, s.cta, tags].filter(Boolean).join('\n\n');
}

// --- compliance gate (Rule: licensed music, AI label, no 3rd-party watermark)
export interface ComplianceResult {
  ok: boolean;
  reason?: string;
}
function checkCompliance(_item: ContentItem): ComplianceResult {
  // MVP stubs — Phase 2 wires real checks. We assume licensed music, add the
  // AI-generated flag at the platform target (TikTok), and trust no third-party
  // watermark since assets are generated in-house.
  return { ok: true };
}

function buildTarget(platform: Platform, accounts: PublishingAccounts): { target: PlatformTarget; accountId: string } | null {
  if (platform === 'instagram') {
    if (!accounts.instagram?.accountId) return null;
    return { accountId: accounts.instagram.accountId, target: { targetType: 'instagram' } };
  }
  if (platform === 'tiktok') {
    if (!accounts.tiktok?.accountId) return null;
    return {
      accountId: accounts.tiktok.accountId,
      target: {
        targetType: 'tiktok',
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        disabledComments: false,
        disabledDuet: false,
        disabledStitch: false,
        isBrandedContent: false,
        isYourBrand: true,
        isAiGenerated: true, // compliance: label AI-generated content
      },
    };
  }
  // facebook
  if (!accounts.facebook?.accountId || !accounts.facebook?.pageId) return null;
  return {
    accountId: accounts.facebook.accountId,
    target: { targetType: 'facebook', pageId: accounts.facebook.pageId },
  };
}

function mediaUrlFor(item: ContentItem, platform: Platform): string | null {
  return item.finalVideoUrls[platform] ?? item.videoUrl ?? item.imageUrl ?? null;
}

async function recordPublication(p: {
  organizationId: number;
  contentItemId: number;
  platform: Platform;
  status: PublicationStatus;
  platformPostId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from('publications').insert({
    organization_id: p.organizationId,
    content_item_id: p.contentItemId,
    platform: p.platform,
    status: p.status,
    published_at: p.status === 'published' ? new Date().toISOString() : null,
    platform_post_id: p.platformPostId ?? null,
    error_message: p.errorMessage ?? null,
  });
}

export interface PublishSummary {
  total: number;
  succeeded: number;
  failed: number;
  results: { platform: Platform; status: PublicationStatus; error?: string }[];
}

/**
 * Publish (or schedule) a content item to its selected platforms via Blotato.
 * Writes a publications row per platform. Returns a per-platform summary; the
 * caller decides the content_item's next state.
 */
export async function publishContentItem(
  tenantId: number,
  item: ContentItem,
  opts: { scheduledAt?: string } = {},
): Promise<PublishingResult<PublishSummary>> {
  const compliance = checkCompliance(item);
  if (!compliance.ok) return { ok: false, error: `Compliance check failed: ${compliance.reason}` };

  const accounts = (await getCredentialJSON<PublishingAccounts>(tenantId, 'publishing_wrapper')) ?? {};

  // Platforms to target: explicit selection, else whichever have final videos.
  const platforms: Platform[] = (item.platforms.length
    ? item.platforms
    : (Object.keys(item.finalVideoUrls) as Platform[])) as Platform[];

  if (platforms.length === 0) {
    return { ok: false, error: 'No platforms selected and no rendered videos to publish' };
  }

  const results: PublishSummary['results'] = [];
  for (const platform of platforms) {
    const built = buildTarget(platform, accounts);
    if (!built) {
      await recordPublication({
        organizationId: tenantId, contentItemId: item.id, platform,
        status: 'failed', errorMessage: `${platform} account not connected in vault (publishing_wrapper)`,
      });
      results.push({ platform, status: 'failed', error: 'account not connected' });
      continue;
    }
    const media = mediaUrlFor(item, platform);
    if (!media) {
      await recordPublication({
        organizationId: tenantId, contentItemId: item.id, platform,
        status: 'failed', errorMessage: 'no media URL available',
      });
      results.push({ platform, status: 'failed', error: 'no media' });
      continue;
    }

    const res = await blotatoPublish({
      accountId: built.accountId,
      text: formatCaption(item, platform),
      mediaUrls: [media],
      target: built.target,
      scheduledTime: opts.scheduledAt,
    });

    if (res.ok) {
      const status: PublicationStatus = opts.scheduledAt ? 'scheduled' : 'published';
      await recordPublication({
        organizationId: tenantId, contentItemId: item.id, platform,
        status, platformPostId: res.data.postSubmissionId,
      });
      results.push({ platform, status });
    } else {
      await recordPublication({
        organizationId: tenantId, contentItemId: item.id, platform,
        status: 'failed', errorMessage: res.error,
      });
      results.push({ platform, status: 'failed', error: res.error });
    }
  }

  const succeeded = results.filter((r) => r.status !== 'failed').length;
  return {
    ok: succeeded > 0,
    data: { total: results.length, succeeded, failed: results.length - succeeded, results },
  };
}

/** Convenience wrapper: schedule a content item for a later time. */
export function schedulePost(
  tenantId: number,
  item: ContentItem,
  scheduledAt: string,
): Promise<PublishingResult<PublishSummary>> {
  return publishContentItem(tenantId, item, { scheduledAt });
}

/** All publications for a tenant, grouped by content_item_id (for the UI). */
export async function listPublicationsByOrg(
  organizationId: number,
): Promise<Record<number, PublicationRecord[]>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('publications')
    .select('id, organization_id, content_item_id, platform, status, published_at, platform_post_id, error_message, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list publications: ${error.message}`);
  const grouped: Record<number, PublicationRecord[]> = {};
  for (const r of data ?? []) {
    const key = r.content_item_id as number;
    (grouped[key] ??= []).push({
      id: r.id as number,
      organizationId: r.organization_id as number,
      contentItemId: key,
      platform: r.platform as Platform,
      status: r.status as PublicationStatus,
      publishedAt: r.published_at as string | null,
      platformPostId: r.platform_post_id as string | null,
      errorMessage: r.error_message as string | null,
      createdAt: r.created_at as string,
    });
  }
  return grouped;
}

// --- analytics (Module 9) ---------------------------------------------------
export async function getAnalytics(
  _postId: string,
  _tenantId: string,
): Promise<PublishingResult<never>> {
  throw new Error('getAnalytics: not implemented — wire in Module 9');
}
