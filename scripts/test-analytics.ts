// ============================================================================
// Module 9 analytics test.
// ----------------------------------------------------------------------------
// Validates the analytics pipeline deterministically:
//   • seeds synthetic snapshots (live metric capture needs connected Blotato
//     accounts — same operator caveat as publishing)
//   • read model: KPIs, follower series, engagement-by-platform, top posts
//   • captureAnalytics runs gracefully + is metered
//   • markItemAnalyzed transitions published -> analyzed
// Leaves the seeded snapshots so the /dashboard/analytics page has data to show;
// pass --clean to remove them afterwards.
// ============================================================================
import './load-env';
import { createClient } from '@supabase/supabase-js';
import { captureAnalytics } from '../src/lib/adapters/publishing';
import { getAnalyticsKpis, getFollowerSeries, getEngagementByPlatform, getTopPosts } from '../src/lib/analytics';
import { markItemAnalyzed } from '../src/lib/content';

let failures = 0;
function check(label: string, ok: boolean, extra?: string) {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await admin.from('organizations').select('id').eq('slug', 'zaazaa').single();
  const orgId = org!.id as number;

  // Pick existing publications (any status) to attach snapshots to, so top-posts
  // can resolve a hook/thumbnail via content_item.
  const { data: pubs } = await admin
    .from('publications')
    .select('id, platform')
    .eq('organization_id', orgId)
    .limit(3);

  console.log('Seed synthetic snapshots (two days, growth):');
  const platforms = ['instagram', 'tiktok', 'facebook'] as const;
  const day1 = new Date(Date.now() - 86_400_000).toISOString();
  const day2 = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  platforms.forEach((platform, i) => {
    const pubId = pubs?.find((p) => p.platform === platform)?.id ?? pubs?.[i]?.id ?? null;
    const base = 800 + i * 400;
    rows.push(
      { organization_id: orgId, publication_id: pubId, platform, snapshot_at: day1, followers: base, engagement_rate: 0.03 + i * 0.01, reach: 1000 + i * 200, impressions: 1500 + i * 200, views: 900 + i * 100, likes: 40 + i * 10, comments: 5 + i, shares: 2 + i },
      { organization_id: orgId, publication_id: pubId, platform, snapshot_at: day2, followers: base + 150, engagement_rate: 0.05 + i * 0.01, reach: 1400 + i * 200, impressions: 2000 + i * 200, views: 1300 + i * 100, likes: 70 + i * 10, comments: 9 + i, shares: 4 + i },
    );
  });
  const seeded = await admin.from('analytics_snapshots').insert(rows);
  check('snapshots inserted', !seeded.error, seeded.error?.message ?? `${rows.length} rows`);

  console.log('\nRead model:');
  const kpis = await getAnalyticsKpis(orgId);
  check('KPI followers computed', kpis.totalFollowers > 0, String(kpis.totalFollowers));
  check('KPI avg engagement computed', kpis.avgEngagementRate > 0, `${(kpis.avgEngagementRate * 100).toFixed(1)}%`);
  check('KPI reach + impressions computed', kpis.totalReach > 0 && kpis.totalImpressions > 0);
  check('lastRefresh present', !!kpis.lastRefresh);

  const series = await getFollowerSeries(orgId);
  check('follower series has >= 2 points (growth)', series.length >= 2, `${series.length} points`);
  if (series.length >= 2) check('followers grew over time', series[series.length - 1].followers >= series[0].followers);

  const eng = await getEngagementByPlatform(orgId);
  check('engagement-by-platform covers 3 platforms', eng.length === 3, eng.map((e) => e.platform).join(', '));

  const top = await getTopPosts(orgId, 5);
  check('top posts ranked', top.length >= 1, `${top.length} posts`);
  if (top[0]) console.log(`    top: "${top[0].hook}" (${top[0].platform}, ${(top[0].engagementRate * 100).toFixed(1)}%)`);

  console.log('\nIngest path (graceful, metered):');
  const cap = await captureAnalytics(orgId);
  check('captureAnalytics runs without error', cap.ok, `snapshots=${cap.data?.snapshots ?? 0}, skipped=${cap.data?.skipped ?? 0}`);

  console.log('\nPublished -> analyzed transition:');
  const { data: pub } = await admin
    .from('content_items')
    .insert({ organization_id: orgId, state: 'published', format: 'reel', script: { hook: 'analytics test item' }, published_at: new Date().toISOString() })
    .select('id')
    .single();
  const testItemId = pub!.id as number;
  await markItemAnalyzed(testItemId);
  const { data: after } = await admin.from('content_items').select('state').eq('id', testItemId).single();
  check('published item transitioned to analyzed', after?.state === 'analyzed', after?.state);
  await admin.from('content_items').delete().eq('id', testItemId);

  if (process.argv.includes('--clean')) {
    await admin.from('analytics_snapshots').delete().eq('organization_id', orgId);
    console.log('\n(cleaned seeded snapshots)');
  }

  console.log(`\n${failures === 0 ? '✓ ANALYTICS CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  console.log('(Note: live metric capture needs real Blotato-connected accounts.)');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Analytics test errored:\n', err.message);
  process.exit(1);
});
