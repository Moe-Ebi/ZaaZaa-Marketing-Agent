import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { PlanCreateTabs } from './PlanCreateTabs';

export const dynamic = 'force-dynamic';

export default async function CreatePlanPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8 text-ink">
      <header className="space-y-1">
        <Link href="/dashboard/plans" className="text-sm text-subtle hover:text-muted">← Plans</Link>
        <h1 className="text-2xl font-semibold">New Marketing Plan</h1>
        <p className="text-sm text-muted">Generate one with AI, or upload an existing plan to import.</p>
      </header>
      <PlanCreateTabs />
    </main>
  );
}
