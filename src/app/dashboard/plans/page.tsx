import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { listPlans } from '@/lib/adapters/planning';
import { PlansTable } from './PlansTable';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const plans = await listPlans(ctx.tenantId);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8 text-ink">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/dashboard" className="text-sm text-subtle hover:text-muted">← Dashboard</Link>
          <h1 className="text-2xl font-semibold">Marketing Plans</h1>
          <p className="text-sm text-muted">Tenant #{ctx.tenantId} · 3-month strategic plans generated with Claude.</p>
        </div>
        <Link href="/dashboard/plans/create" className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-strong">
          New plan
        </Link>
      </header>
      <PlansTable plans={plans} />
    </main>
  );
}
