import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import {
  getAnalyticsKpis,
  getFollowerSeries,
  getEngagementByPlatform,
  getTopPosts,
  type FollowerPoint,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

const fmt = new Intl.NumberFormat('en');
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function LineChart({ points }: { points: FollowerPoint[] }) {
  const W = 640, H = 200, P = 28;
  if (points.length === 0) return <p className="text-sm text-subtle">No follower data yet.</p>;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.followers);
  const maxY = Math.max(...ys, 1);
  const minY = Math.min(...ys, 0);
  const sx = (i: number) => P + (xs.length === 1 ? (W - 2 * P) / 2 : (i / (xs.length - 1)) * (W - 2 * P));
  const sy = (y: number) => H - P - ((y - minY) / (maxY - minY || 1)) * (H - 2 * P);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.followers).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#3f3f46" />
      <line x1={P} y1={P} x2={P} y2={H - P} stroke="#3f3f46" />
      <path d={path} fill="none" stroke="#818cf8" strokeWidth="2" />
      {points.map((p, i) => <circle key={i} cx={sx(i)} cy={sy(p.followers)} r="3" fill="#818cf8" />)}
      <text x={P} y={P - 8} fill="#71717a" fontSize="11">{fmt.format(maxY)}</text>
      <text x={P} y={H - 8} fill="#71717a" fontSize="11">{points[0].date}</text>
      <text x={W - P} y={H - 8} fill="#71717a" fontSize="11" textAnchor="end">{points[points.length - 1].date}</text>
    </svg>
  );
}

export default async function AnalyticsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const [kpis, series, engagement, top] = await Promise.all([
    getAnalyticsKpis(ctx.tenantId),
    getFollowerSeries(ctx.tenantId),
    getEngagementByPlatform(ctx.tenantId),
    getTopPosts(ctx.tenantId, 5),
  ]);
  const maxEng = Math.max(...engagement.map((e) => e.engagementRate), 0.0001);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8 text-ink">
      <header className="space-y-1">
        <Link href="/dashboard" className="text-sm text-subtle hover:text-muted">← Dashboard</Link>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted">
          Tenant #{ctx.tenantId}
          {kpis.lastRefresh
            ? ` · last update ${new Date(kpis.lastRefresh).toLocaleString()} · ${kpis.snapshotCount} snapshots`
            : ' · no snapshots yet'}
        </p>
      </header>

      {kpis.snapshotCount === 0 && (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-subtle">
          No analytics yet. Once posts are published and the ingest cron runs (or you trigger
          <code className="mx-1 rounded bg-surface-2 px-1">analytics/ingest.requested</code>), metrics appear here.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Followers" value={fmt.format(kpis.totalFollowers)} />
        <Kpi label="Avg engagement" value={pct(kpis.avgEngagementRate)} />
        <Kpi label="Reach" value={fmt.format(kpis.totalReach)} />
        <Kpi label="Impressions" value={fmt.format(kpis.totalImpressions)} />
      </section>

      <section className="space-y-2 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-medium text-muted">Follower growth</h2>
        <LineChart points={series} />
      </section>

      <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-medium text-muted">Engagement rate by platform</h2>
        {engagement.length === 0 ? (
          <p className="text-sm text-subtle">No data yet.</p>
        ) : (
          <div className="space-y-2">
            {engagement.map((e) => (
              <div key={e.platform} className="flex items-center gap-3 text-sm">
                <span className="w-20 capitalize text-muted">{e.platform}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-surface-2">
                  <div className="h-full bg-brand" style={{ width: `${(e.engagementRate / maxEng) * 100}%` }} />
                </div>
                <span className="w-16 text-right font-mono text-muted">{pct(e.engagementRate)}</span>
                <span className="w-16 text-right text-xs text-subtle">{e.posts} posts</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Top posts by engagement</h2>
        {top.length === 0 ? (
          <p className="text-sm text-subtle">No published posts with analytics yet.</p>
        ) : (
          <div className="space-y-2">
            {top.map((p, i) => (
              <div key={`${p.contentItemId}-${p.platform}-${i}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded bg-surface-2" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink" title={p.hook}>{p.hook}</p>
                  <p className="text-xs text-subtle capitalize">{p.platform} · {pct(p.engagementRate)} engagement</p>
                </div>
                <div className="text-right text-xs text-muted">
                  <p>{fmt.format(p.views)} views</p>
                  <p>{fmt.format(p.likes)}♥ · {fmt.format(p.comments)}💬 · {fmt.format(p.shares)}↗</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
