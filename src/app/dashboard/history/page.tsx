import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { listContentItems, listVariantsByOrg } from '@/lib/content';
import { HistoryView } from './HistoryView';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const [items, variantsByItem] = await Promise.all([
    listContentItems(ctx.tenantId, 200),
    listVariantsByOrg(ctx.tenantId),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8 text-zinc-50">
      <header className="space-y-1">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300">← Dashboard</Link>
        <h1 className="text-2xl font-semibold">Content History</h1>
        <p className="text-sm text-zinc-400">Tenant #{ctx.tenantId} · everything generated, in reverse order.</p>
      </header>
      <HistoryView items={items} variantsByItem={variantsByItem} />
    </main>
  );
}
