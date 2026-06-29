import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { redirect } from 'next/navigation';
import { getBrandProfile } from '@/lib/brand';
import { getAnalyticsKpis } from '@/lib/analytics';
import { listItemsByState } from '@/lib/content';
import { PageHeader, Card, StatCard, Badge, SectionTitle } from '@/components/ui';

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const fmt = new Intl.NumberFormat('en');
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const [profile, kpis, awaiting, scheduled] = await Promise.all([
    getBrandProfile(ctx.tenantId),
    getAnalyticsKpis(ctx.tenantId),
    listItemsByState(ctx.tenantId, ['ready_for_review']),
    listItemsByState(ctx.tenantId, ['scheduled']),
  ]);
  const voice = profile?.voiceProfile;
  const hasVoice = !!(voice && (voice.tone.length || voice.personality));

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 sm:p-8">
      <PageHeader
        title="Dashboard"
        description={
          <>
            Tenant #{ctx.tenantId} · analytics updated{' '}
            <span className="text-ink">{kpis.lastRefresh ? timeAgo(kpis.lastRefresh) : 'never'}</span>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Followers" value={fmt.format(kpis.totalFollowers)} />
        <StatCard label="Avg engagement" value={`${(kpis.avgEngagementRate * 100).toFixed(1)}%`} />
        <StatCard label="Awaiting review" value={awaiting.length} hint="in the approval queue" />
        <StatCard label="Scheduled" value={scheduled.length} hint="upcoming posts" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionTitle>Brand voice</SectionTitle>
              {hasVoice ? (
                <p className="mt-2 text-sm text-ink">
                  <span className="font-medium">{profile?.brandName ?? 'Brand'}</span>
                  {voice!.tone.length > 0 && <> · {voice!.tone.slice(0, 3).join(', ')}</>}
                  {voice!.personality && <span className="text-muted"> — {voice!.personality}</span>}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">No brand profile yet — set one up to power every generation.</p>
              )}
            </div>
            <Link href="/dashboard/brand" className="btn-ghost btn-sm shrink-0">
              {hasVoice ? 'Edit' : 'Set up'}
            </Link>
          </div>
          {hasVoice && voice && (
            <div className="mt-4 flex flex-wrap gap-2">
              {voice.values.slice(0, 5).map((v) => <Badge key={v} tone="brand">{v}</Badge>)}
              {voice.content_themes.slice(0, 4).map((t) => <Badge key={t}>{t}</Badge>)}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Quick actions</SectionTitle>
          <div className="mt-3 grid gap-2">
            <Link href="/dashboard/content" className="btn-primary w-full">Generate content</Link>
            <Link href="/dashboard/plans/create" className="btn-secondary w-full">New marketing plan</Link>
            <Link href="/dashboard/approvals" className="btn-ghost w-full">
              Review queue {awaiting.length > 0 && <Badge tone="info">{awaiting.length}</Badge>}
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
