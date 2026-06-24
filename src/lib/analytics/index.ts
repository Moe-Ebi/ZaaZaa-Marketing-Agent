// ============================================================================
// Analytics read model — dashboard queries over analytics_snapshots.
// ----------------------------------------------------------------------------
// Tenant-scoped reads (explicit organization_id). Computes KPIs, follower
// growth, per-platform engagement, and a top-posts ranking from the latest
// snapshot per publication.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';

export type Platform = 'instagram' | 'tiktok' | 'facebook';

interface SnapshotRow {
  publication_id: number | null;
  platform: Platform;
  snapshot_at: string;
  followers: number;
  engagement_rate: number;
  reach: number;
  impressions: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface AnalyticsKpis {
  totalFollowers: number;
  avgEngagementRate: number;
  totalReach: number;
  totalImpressions: number;
  lastRefresh: string | null;
  snapshotCount: number;
}

export interface FollowerPoint { date: string; followers: number }
export interface PlatformEngagement { platform: Platform; engagementRate: number; posts: number }
export interface TopPost {
  contentItemId: number;
  platform: Platform;
  hook: string;
  imageUrl: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

async function allSnapshots(organizationId: number): Promise<SnapshotRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('analytics_snapshots')
    .select('publication_id, platform, snapshot_at, followers, engagement_rate, reach, impressions, views, likes, comments, shares')
    .eq('organization_id', organizationId)
    .order('snapshot_at', { ascending: false });
  if (error) throw new Error(`Failed to read analytics: ${error.message}`);
  return (data ?? []) as SnapshotRow[];
}

/** Latest snapshot per publication (rows arrive newest-first). */
function latestPerPublication(rows: SnapshotRow[]): SnapshotRow[] {
  const seen = new Set<number>();
  const out: SnapshotRow[] = [];
  for (const r of rows) {
    const key = r.publication_id ?? -1;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export async function getAnalyticsKpis(organizationId: number): Promise<AnalyticsKpis> {
  const rows = await allSnapshots(organizationId);
  if (rows.length === 0) {
    return { totalFollowers: 0, avgEngagementRate: 0, totalReach: 0, totalImpressions: 0, lastRefresh: null, snapshotCount: 0 };
  }
  const latest = latestPerPublication(rows);

  // Followers are account-level: take the most recent per platform, then sum.
  const followersByPlatform = new Map<Platform, number>();
  for (const r of rows) {
    if (!followersByPlatform.has(r.platform)) followersByPlatform.set(r.platform, r.followers);
  }
  const totalFollowers = [...followersByPlatform.values()].reduce((a, b) => a + b, 0);

  const avgEngagementRate = latest.reduce((a, r) => a + r.engagement_rate, 0) / latest.length;
  const totalReach = latest.reduce((a, r) => a + r.reach, 0);
  const totalImpressions = latest.reduce((a, r) => a + r.impressions, 0);

  return {
    totalFollowers,
    avgEngagementRate,
    totalReach,
    totalImpressions,
    lastRefresh: rows[0].snapshot_at,
    snapshotCount: rows.length,
  };
}

/** Follower growth over time: per day, sum of latest-per-platform followers. */
export async function getFollowerSeries(organizationId: number): Promise<FollowerPoint[]> {
  const rows = await allSnapshots(organizationId);
  // group by day -> per platform latest followers that day
  const byDay = new Map<string, Map<Platform, number>>();
  // rows newest-first; iterate oldest-first so later (newer) overwrites per day
  for (const r of [...rows].reverse()) {
    const day = r.snapshot_at.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, new Map());
    byDay.get(day)!.set(r.platform, r.followers);
  }
  return [...byDay.entries()]
    .map(([date, perPlatform]) => ({ date, followers: [...perPlatform.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getEngagementByPlatform(organizationId: number): Promise<PlatformEngagement[]> {
  const latest = latestPerPublication(await allSnapshots(organizationId));
  const agg = new Map<Platform, { sum: number; n: number }>();
  for (const r of latest) {
    const a = agg.get(r.platform) ?? { sum: 0, n: 0 };
    a.sum += r.engagement_rate;
    a.n += 1;
    agg.set(r.platform, a);
  }
  return [...agg.entries()].map(([platform, { sum, n }]) => ({
    platform,
    engagementRate: n ? sum / n : 0,
    posts: n,
  }));
}

export async function getTopPosts(organizationId: number, limit = 5): Promise<TopPost[]> {
  const rows = latestPerPublication(await allSnapshots(organizationId));
  if (rows.length === 0) return [];

  // Map publication -> content item for hook/thumbnail.
  const admin = createAdminClient();
  const pubIds = rows.map((r) => r.publication_id).filter((x): x is number => x != null);
  const { data: pubs } = await admin
    .from('publications')
    .select('id, content_item_id')
    .in('id', pubIds);
  const itemByPub = new Map<number, number>();
  for (const p of pubs ?? []) itemByPub.set(p.id as number, p.content_item_id as number);

  const itemIds = [...new Set([...itemByPub.values()])];
  const { data: items } = await admin
    .from('content_items')
    .select('id, script, image_url')
    .in('id', itemIds.length ? itemIds : [-1]);
  const itemMeta = new Map<number, { hook: string; imageUrl: string | null }>();
  for (const it of items ?? []) {
    const hook = ((it.script ?? {}) as { hook?: string }).hook ?? `Item #${it.id}`;
    itemMeta.set(it.id as number, { hook, imageUrl: (it.image_url as string | null) ?? null });
  }

  return rows
    .map((r) => {
      const itemId = r.publication_id != null ? itemByPub.get(r.publication_id) ?? -1 : -1;
      const meta = itemMeta.get(itemId);
      return {
        contentItemId: itemId,
        platform: r.platform,
        hook: meta?.hook ?? `Item #${itemId}`,
        imageUrl: meta?.imageUrl ?? null,
        views: r.views,
        likes: r.likes,
        comments: r.comments,
        shares: r.shares,
        engagementRate: r.engagement_rate,
      };
    })
    .sort((a, b) => b.engagementRate - a.engagementRate || b.views - a.views)
    .slice(0, limit);
}
