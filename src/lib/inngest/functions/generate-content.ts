// ============================================================================
// Content generation pipeline (Inngest) — Rule 4: runs in the background.
// ----------------------------------------------------------------------------
// Triggers:
//   • content/generate.requested  — on-demand ("Generate" button) or manual
//     product upload; data may carry { organizationId, productId }
//   • weekly cron                 — scheduled batch across all tenants
// Each tenant run is wrapped in its own step so one failure never aborts the
// batch. The heavy lifting + failure handling lives in runContentGeneration.
// ============================================================================
import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runContentGeneration } from '@/lib/content/pipeline';

export async function listOrgsWithProducts(): Promise<number[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('products').select('organization_id');
  if (error) throw new Error(`Failed to list orgs with products: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.organization_id as number))];
}

export const generateContent = inngest.createFunction(
  {
    id: 'generate-content',
    triggers: [
      { event: 'content/generate.requested' }, // on-demand + manual upload
      { cron: '0 6 * * 1' }, // weekly batch, Monday 06:00 UTC
    ],
  },
  async ({ event, step }) => {
    const data = event?.data as { organizationId?: number; productId?: number } | undefined;

    if (data?.organizationId) {
      const item = await step.run(`generate-${data.organizationId}`, () =>
        runContentGeneration(data.organizationId!, { productId: data.productId }),
      );
      return { generated: 1, items: [{ id: item.id, state: item.state }] };
    }

    // Scheduled batch: one fresh item per tenant that has products.
    const orgIds = await step.run('orgs-with-products', listOrgsWithProducts);
    const items = [];
    for (const orgId of orgIds) {
      const item = await step.run(`generate-${orgId}`, () => runContentGeneration(orgId));
      items.push({ id: item.id, state: item.state, organizationId: orgId });
    }
    return { generated: items.length, items };
  },
);
