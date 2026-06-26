import { redirect, notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { getPlanDetail } from '@/lib/adapters/planning';
import { PlanView } from './PlanView';

export const dynamic = 'force-dynamic';

export default async function PlanViewPage({ params }: { params: Promise<{ planId: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const { planId } = await params;
  const plan = await getPlanDetail(ctx.tenantId, Number(planId));
  if (!plan) notFound();

  return (
    <main className="mx-auto max-w-4xl p-8 text-ink">
      <PlanView plan={plan} />
    </main>
  );
}
