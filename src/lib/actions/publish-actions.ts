'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/context';
import { assertItemOrg } from '@/lib/content';
import { inngest } from '@/lib/inngest/client';

export type PublishActionResult = { ok: boolean; message: string };

/**
 * "Publish Now" — enqueues an immediate publish job for an approved/scheduled
 * item (Rule 4: the actual posting runs in Inngest, not in this request).
 */
export async function publishNow(contentId: number): Promise<PublishActionResult> {
  const ctx = await requireTenantContext();
  try {
    const item = await assertItemOrg(contentId, ctx.tenantId);
    if (item.state !== 'approved' && item.state !== 'scheduled') {
      return { ok: false, message: `Only approved/scheduled items can be published (state is "${item.state}")` };
    }
    await inngest.send({
      name: 'content/publish.requested',
      data: { contentItemId: contentId, organizationId: ctx.tenantId },
    });
    revalidatePath('/dashboard/calendar');
    revalidatePath('/dashboard/history');
    return { ok: true, message: 'Publishing… (posting in the background)' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
