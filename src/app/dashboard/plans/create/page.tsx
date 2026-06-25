import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { PlanCreator } from './PlanCreator';

export const dynamic = 'force-dynamic';

export default async function CreatePlanPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8 text-zinc-50">
      <header className="space-y-1">
        <Link href="/dashboard/plans" className="text-sm text-zinc-500 hover:text-zinc-300">← Plans</Link>
        <h1 className="text-2xl font-semibold">New Marketing Plan</h1>
        <p className="text-sm text-zinc-400">Tenant #{ctx.tenantId}</p>
      </header>
      <PlanCreator />
    </main>
  );
}
