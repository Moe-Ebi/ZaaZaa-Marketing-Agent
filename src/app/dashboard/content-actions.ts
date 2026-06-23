'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  assertItemOrg,
  approveItem,
  rejectItem,
  scheduleItem,
  updateItemContent,
} from '@/lib/content';
import type { Platform } from '@/lib/adapters/generation';

export type ContentActionResult = { ok: boolean; message: string };

function revalidateAll() {
  revalidatePath('/dashboard/approvals');
  revalidatePath('/dashboard/calendar');
  revalidatePath('/dashboard/history');
  revalidatePath('/dashboard/content');
}

/** Approve a ready-for-review item (optionally with an edited caption + platforms). */
export async function approveContent(
  contentId: number,
  editedCaption?: string,
  selectedPlatforms?: Platform[],
): Promise<ContentActionResult> {
  const ctx = await requireTenantContext();
  try {
    const item = await assertItemOrg(contentId, ctx.tenantId);
    if (item.state !== 'ready_for_review') {
      return { ok: false, message: `Cannot approve from state "${item.state}"` };
    }
    await approveItem(contentId, ctx.userId, {
      caption: editedCaption,
      platforms: selectedPlatforms,
    });
    revalidateAll();
    return { ok: true, message: 'Approved.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Reject an item with a reason (→ failed_retryable, re-generatable). */
export async function rejectContent(contentId: number, reason: string): Promise<ContentActionResult> {
  const ctx = await requireTenantContext();
  if (!reason.trim()) return { ok: false, message: 'A rejection reason is required' };
  try {
    await assertItemOrg(contentId, ctx.tenantId);
    await rejectItem(contentId, reason.trim());
    revalidateAll();
    return { ok: true, message: 'Rejected.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Schedule an approved item for a given time. */
export async function scheduleContent(
  contentId: number,
  scheduledAt: string,
  platforms?: Platform[],
): Promise<ContentActionResult> {
  const ctx = await requireTenantContext();
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) return { ok: false, message: 'Invalid date/time' };
  try {
    const item = await assertItemOrg(contentId, ctx.tenantId);
    if (item.state !== 'approved') {
      return { ok: false, message: `Only approved items can be scheduled (state is "${item.state}")` };
    }
    await scheduleItem(contentId, when.toISOString(), platforms);
    revalidateAll();
    return { ok: true, message: `Scheduled for ${when.toLocaleString()}.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Edit-before-publish: tweak hook/body/cta/hashtags/caption in place. */
export async function updateContentBeforeApproval(
  contentId: number,
  updates: { hook?: string; body?: string; cta?: string; hashtags?: string[]; caption?: string },
): Promise<ContentActionResult> {
  const ctx = await requireTenantContext();
  try {
    await assertItemOrg(contentId, ctx.tenantId);
    await updateItemContent(contentId, updates);
    revalidateAll();
    return { ok: true, message: 'Saved.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
