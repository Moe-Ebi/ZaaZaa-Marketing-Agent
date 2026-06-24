// ============================================================================
// Analytics ingest (Inngest) — daily cron + on-demand event.
// ----------------------------------------------------------------------------
// Rule 4: runs in the background. For each tenant with published content it
// pulls metrics from Blotato, writes analytics_snapshots, and transitions any
// published item that now has analytics to the 'analyzed' state. Per-org
// isolation: one tenant's failure never aborts the batch. Posts whose metrics
// haven't landed yet (1-2h lag) are skipped and retried next run.
// ============================================================================
import { inngest } from '../client';
import { captureAnalytics } from '@/lib/adapters/publishing';
import { listOrgsWithPublishedContent, markItemAnalyzed } from '@/lib/content';

export interface IngestOutcome {
  organizationId: number;
  snapshots: number;
  skipped: number;
  analyzed: number;
  error?: string;
}

export async function ingestAnalyticsForOrg(organizationId: number): Promise<IngestOutcome> {
  const res = await captureAnalytics(organizationId);
  if (!res.ok || !res.data) {
    return { organizationId, snapshots: 0, skipped: 0, analyzed: 0, error: res.error ?? 'capture failed' };
  }

  let analyzed = 0;
  for (const itemId of res.data.itemIds) {
    try {
      await markItemAnalyzed(itemId);
      analyzed++;
    } catch {
      // already analyzed or invalid transition — ignore, not fatal
    }
  }
  return { organizationId, snapshots: res.data.snapshots, skipped: res.data.skipped, analyzed };
}

export const ingestAnalytics = inngest.createFunction(
  {
    id: 'ingest-analytics',
    triggers: [
      { cron: '0 6 * * *' }, // daily 06:00 UTC
      { event: 'analytics/ingest.requested' }, // manual trigger
    ],
  },
  async ({ event, step }) => {
    const requestedOrg = (event?.data as { organizationId?: number } | undefined)?.organizationId;
    const orgIds = requestedOrg
      ? [requestedOrg]
      : await step.run('list-orgs', listOrgsWithPublishedContent);

    const outcomes: IngestOutcome[] = [];
    for (const orgId of orgIds) {
      const outcome = await step.run(`ingest-${orgId}`, () => ingestAnalyticsForOrg(orgId));
      outcomes.push(outcome);
    }

    const totals = outcomes.reduce(
      (a, o) => ({ snapshots: a.snapshots + o.snapshots, analyzed: a.analyzed + o.analyzed }),
      { snapshots: 0, analyzed: 0 },
    );
    return { tenants: orgIds.length, ...totals, outcomes };
  },
);
