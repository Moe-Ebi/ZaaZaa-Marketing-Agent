import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { listContentItems } from '@/lib/content';
import type { ContentState } from '@/lib/content/types';
import { GenerateButton } from './GenerateButton';

export const dynamic = 'force-dynamic';

const STATE_STYLE: Record<ContentState, string> = {
  draft: 'text-muted',
  generating: 'text-amber-400',
  ready_for_review: 'text-success',
  waiting_for_credits: 'text-orange-400',
  failed_retryable: 'text-danger',
  approved: 'text-emerald-400',
  scheduled: 'text-blue-400',
  published: 'text-sky-400',
  analyzed: 'text-purple-400',
};

export default async function ContentPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const items = await listContentItems(ctx.tenantId, 50);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8 text-ink">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/dashboard" className="text-sm text-subtle hover:text-muted">← Dashboard</Link>
          <h1 className="text-2xl font-semibold">Content</h1>
          <p className="text-sm text-muted">
            Tenant #{ctx.tenantId} · {items.length} items. Generation runs in the background.
          </p>
        </div>
        <GenerateButton />
      </header>

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">Format</th>
              <th className="px-4 py-2 font-medium">Hook angle</th>
              <th className="px-4 py-2 font-medium">Hook</th>
              <th className="px-4 py-2 font-medium">Platforms</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-subtle">No content yet — click &ldquo;Generate content&rdquo;.</td></tr>
            )}
            {items.map((it) => {
              const hook = (it.script as { hook?: string }).hook ?? '—';
              const platforms = Object.keys(it.finalVideoUrls);
              return (
                <tr key={it.id} className="border-t border-line align-top">
                  <td className="px-4 py-2 text-subtle">{it.id}</td>
                  <td className={`px-4 py-2 font-mono ${STATE_STYLE[it.state]}`}>{it.state}</td>
                  <td className="px-4 py-2">{it.format ?? '—'}</td>
                  <td className="px-4 py-2 text-muted">{it.hookAngle ?? '—'}</td>
                  <td className="px-4 py-2 max-w-xs truncate text-muted" title={hook}>{hook}</td>
                  <td className="px-4 py-2 text-muted">{platforms.length ? platforms.join(', ') : '—'}</td>
                  <td className="px-4 py-2 text-subtle">{new Date(it.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
