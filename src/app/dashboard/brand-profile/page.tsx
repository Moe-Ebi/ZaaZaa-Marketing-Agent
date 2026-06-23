import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { getBrandProfile } from '@/lib/brand';
import { BrandProfileEditor } from './BrandProfileEditor';

export const dynamic = 'force-dynamic';

export default async function BrandProfilePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const profile = await getBrandProfile(ctx.tenantId);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8 text-zinc-50">
      <header className="space-y-1">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300">← Dashboard</Link>
        <h1 className="text-2xl font-semibold">Brand Profile</h1>
        <p className="text-sm text-zinc-400">
          Tenant #{ctx.tenantId}. The voice profile is the source of truth every content generation reads.
        </p>
      </header>
      <BrandProfileEditor initialProfile={profile} />
    </main>
  );
}
