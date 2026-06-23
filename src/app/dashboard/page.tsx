import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { getBrandProfile } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const profile = await getBrandProfile(ctx.tenantId);
  const voice = profile?.voiceProfile;
  const summary =
    profile && (voice?.tone.length || voice?.personality)
      ? `${profile.brandName ?? 'Brand'}: ${voice?.tone.slice(0, 3).join(', ')}${voice?.personality ? ` — ${voice.personality}` : ''}`
      : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8 text-zinc-50">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-400">Tenant #{ctx.tenantId} · {ctx.email}</p>
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

      <nav className="grid gap-3 sm:grid-cols-3">
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
