import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { listItemsByState, listVariants } from '@/lib/content';
import { ApprovalCard } from './ApprovalCard';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const items = await listItemsByState(ctx.tenantId, ['ready_for_review']);
  const variantsByItem = await Promise.all(items.map((i) => listVariants(i.id)));

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8 text-zinc-50">
      <header className="space-y-1">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300">← Dashboard</Link>
        <h1 className="text-2xl font-semibold">Approval Queue</h1>
        <p className="text-sm text-zinc-400">
          Tenant #{ctx.tenantId} · {items.length} item(s) awaiting review. Nothing goes live without approval.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-500">
          Nothing to review. Generate content from the{' '}
          <Link href="/dashboard/content" className="text-indigo-400 hover:underline">Content</Link> page.
        </p>
      ) : (
        <div className="space-y-6">
          {items.map((item, i) => (
            <ApprovalCard key={item.id} item={item} variants={variantsByItem[i]} />
          ))}
        </div>
      )}
    </main>
  );
}
