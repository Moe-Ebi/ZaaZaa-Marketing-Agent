import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { getBrandProfile } from '@/lib/brand';
import { PageHeader } from '@/components/ui';
import { BrandSettings } from './BrandSettings';

export const dynamic = 'force-dynamic';

export default async function BrandPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const profile = await getBrandProfile(ctx.tenantId);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <PageHeader
        title="Brand"
        description="Your identity, voice and guidelines — this is what every generation is built from."
      />
      <BrandSettings initial={profile} />
    </main>
  );
}
