import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { getBrandProfile } from '@/lib/brand';
import { getAnalyticsKpis } from '@/lib/analytics';

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const [profile, kpis] = await Promise.all([
    getBrandProfile(ctx.tenantId),
    getAnalyticsKpis(ctx.tenantId),
  ]);
  const voice = profile?.voiceProfile;
  const summary =
    profile && (voice?.tone.length || voice?.personality)
      ? `${profile.brandName ?? 'Brand'}: ${voice?.tone.slice(0, 3).join(', ')}${voice?.personality ? ` — ${voice.personality}` : ''}`
      : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8 text-zinc-50">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-400">
          Tenant #{ctx.tenantId} · {ctx.email}
          {' · '}
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            Last analytics update: {kpis.lastRefresh ? timeAgo(kpis.lastRefresh) : 'never'}
          </span>
        </p>
      </header>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium">Brand voice</h2>
            {summary ? (
              <p className="mt-1 text-sm text-zinc-300">{summary}</p>
            ) : (
              <p className="mt-1 text-sm text-zinc-500">No brand profile yet — set one up to power content generation.</p>
            )}
          </div>
          <Link
            href="/dashboard/brand-profile"
            className="shrink-0 rounded-lg border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            {summary ? 'Edit profile' : 'Set up profile'}
          </Link>
        </div>
        {summary && voice && (
          <div className="mt-4 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
            {voice.values.length > 0 && <p><span className="text-zinc-500">Values:</span> {voice.values.join(', ')}</p>}
            {voice.content_themes.length > 0 && <p><span className="text-zinc-500">Themes:</span> {voice.content_themes.join(', ')}</p>}
            {profile?.targetAudience && <p><span className="text-zinc-500">Audience:</span> {profile.targetAudience}</p>}
            {voice.prohibition_keywords.length > 0 && <p><span className="text-zinc-500">Avoid:</span> {voice.prohibition_keywords.join(', ')}</p>}
          </div>
        )}
      </section>

      <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/content" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="font-medium">Content</p>
          <p className="text-xs text-zinc-500">Generate &amp; review</p>
        </Link>
        <Link href="/dashboard/approvals" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="font-medium">Approvals</p>
          <p className="text-xs text-zinc-500">Review &amp; approve</p>
        </Link>
        <Link href="/dashboard/calendar" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="font-medium">Calendar</p>
          <p className="text-xs text-zinc-500">Schedule &amp; upcoming</p>
        </Link>
        <Link href="/dashboard/history" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="font-medium">History</p>
          <p className="text-xs text-zinc-500">All content + states</p>
        </Link>
        <Link href="/dashboard/analytics" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="font-medium">Analytics</p>
          <p className="text-xs text-zinc-500">Performance &amp; growth</p>
        </Link>
        <Link href="/dashboard/products" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="font-medium">Products</p>
          <p className="text-xs text-zinc-500">WooCommerce catalogue</p>
        </Link>
        <Link href="/dashboard/brand-profile" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="font-medium">Brand Profile</p>
          <p className="text-xs text-zinc-500">Voice & identity</p>
        </Link>
        <Link href="/admin/credentials" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="font-medium">Credentials</p>
          <p className="text-xs text-zinc-500">Vault (operator)</p>
        </Link>
      </nav>
    </main>
  );
}
