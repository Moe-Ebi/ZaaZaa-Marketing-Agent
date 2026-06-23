'use server';

import { requireTenantContext } from '@/lib/tenant/context';
import { inngest } from '@/lib/inngest/client';

export type SyncActionState = { ok: boolean; message: string };

/** "Sync now" — enqueues the WooCommerce sync job for the active tenant (Rule 4:
 *  the work runs in Inngest, not in this request). */
export async function triggerSync(
  _prev: SyncActionState,
  _formData: FormData,
): Promise<SyncActionState> {
  const ctx = await requireTenantContext();
  try {
    await inngest.send({
      name: 'woocommerce/sync.requested',
      data: { organizationId: ctx.tenantId },
    });
    return { ok: true, message: 'Sync queued — products will refresh shortly.' };
  } catch (err) {
    return { ok: false, message: `Could not queue sync: ${(err as Error).message}` };
  }
}
