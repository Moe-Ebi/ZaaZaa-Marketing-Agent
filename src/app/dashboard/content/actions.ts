'use server';

import { requireTenantContext } from '@/lib/tenant/context';
import { inngest } from '@/lib/inngest/client';

export type GenerateActionState = { ok: boolean; message: string };

/** Enqueue a content generation run for the active tenant (Rule 4: background). */
export async function triggerGenerate(
  _prev: GenerateActionState,
  formData: FormData,
): Promise<GenerateActionState> {
  const ctx = await requireTenantContext();
  const productIdRaw = formData.get('productId');
  const productId = productIdRaw ? Number(productIdRaw) : undefined;
  try {
    await inngest.send({
      name: 'content/generate.requested',
      data: { organizationId: ctx.tenantId, ...(productId ? { productId } : {}) },
    });
    return { ok: true, message: 'Generation queued — the item will appear and move through states.' };
  } catch (err) {
    return { ok: false, message: `Could not queue generation: ${(err as Error).message}` };
  }
}
