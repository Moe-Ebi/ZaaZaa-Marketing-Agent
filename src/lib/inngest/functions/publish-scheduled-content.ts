// ============================================================================
// Scheduled + on-demand publishing (Inngest).
// ----------------------------------------------------------------------------
// Rule 4: publishing runs in the background, independent of the operator — the
// cron fires due posts even when nobody is online (critical during load-shedding).
//   • cron every 5 min  → publish all content_items where state=scheduled and
//                          scheduled_at <= now
//   • event 'content/publish.requested' {contentItemId, organizationId}
//                        → "Publish Now" for one item
// Per-item failures are isolated (one tenant's failure doesn't abort the batch).
// ============================================================================
import { inngest } from '../client';
import {
  getContentItem,
  listDueScheduledItems,
  markItemPublished,
  markItemPublishFailed,
} from '@/lib/content';
import { publishContentItem } from '@/lib/adapters/publishing';

export interface PublishOutcome {
  contentItemId: number;
  state: 'published' | 'failed_retryable' | 'skipped';
  succeeded: number;
  failed: number;
  error?: string;
}

/** Publish one item now, then transition it based on the result. */
export async function publishOneItem(organizationId: number, contentItemId: number): Promise<PublishOutcome> {
  const item = await getContentItem(contentItemId);
  if (!item || item.organizationId !== organizationId) {
    return { contentItemId, state: 'skipped', succeeded: 0, failed: 0, error: 'not found' };
  }

  const res = await publishContentItem(organizationId, item);
  const summary = res.data ?? { total: 0, succeeded: 0, failed: 0, results: [] };

  if (res.ok && summary.failed === 0) {
    await markItemPublished(contentItemId);
    return { contentItemId, state: 'published', succeeded: summary.succeeded, failed: 0 };
  }

  // Any failure (or zero platforms) → leave the queue via failed_retryable so we
  // don't loop forever; operator can review and re-publish.
  const reason = res.error ?? summary.results.find((r) => r.error)?.error ?? 'publish failed';
  await markItemPublishFailed(contentItemId, reason);
  return {
    contentItemId,
    state: summary.succeeded > 0 ? 'published' : 'failed_retryable',
    succeeded: summary.succeeded,
    failed: summary.failed,
    error: reason,
  };
}

export const publishScheduledContent = inngest.createFunction(
  {
    id: 'publish-scheduled-content',
    triggers: [
      { cron: '*/5 * * * *' }, // every 5 minutes
      { event: 'content/publish.requested' }, // "Publish Now"
    ],
  },
  async ({ event, step }) => {
    const requested = event?.data as { contentItemId?: number; organizationId?: number } | undefined;

    // On-demand single item.
    if (requested?.contentItemId && requested?.organizationId) {
      const outcome = await step.run(`publish-${requested.contentItemId}`, () =>
        publishOneItem(requested.organizationId!, requested.contentItemId!),
      );
      return { mode: 'on-demand', outcomes: [outcome] };
    }

    // Cron: every due scheduled item, each isolated.
    const due = await step.run('list-due', () => listDueScheduledItems(new Date().toISOString()));
    const outcomes: PublishOutcome[] = [];
    for (const item of due) {
      const outcome = await step.run(`publish-${item.id}`, () =>
        publishOneItem(item.organizationId, item.id),
      );
      outcomes.push(outcome);
    }
    return { mode: 'cron', due: due.length, outcomes };
  },
);
