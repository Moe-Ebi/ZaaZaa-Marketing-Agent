import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { Sidebar } from './Sidebar';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar email={ctx.email} tenantId={ctx.tenantId} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
