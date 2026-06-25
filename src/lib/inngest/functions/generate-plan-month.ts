// ============================================================================
// Rolling plan-month generation (Inngest) — Rule 4.
// ----------------------------------------------------------------------------
//   • event 'plan/month.generate' {planId, month, organizationId}
//       → fired on plan approval to generate Month 1 immediately
//   • weekly cron (Mon 09:00 UTC)
//       → for each active plan, generate the EARLIEST month that still has
//         'planned' items (queues at most one month ahead; items already
//         'generating' are skipped, so a month in flight is never re-picked)
// Per-plan failures are isolated.
// ============================================================================
import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateMonthContent } from '@/lib/services/plan-content-generator';

interface ActivePlan {
  id: number;
  organizationId: number;
}

async function listActivePlans(): Promise<ActivePlan[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('marketing_plans')
    .select('id, organization_id')
    .in('status', ['approved', 'active']);
  if (error) throw new Error(`Failed to list active plans: ${error.message}`);
  return (data ?? []).map((p) => ({ id: p.id as number, organizationId: p.organization_id as number }));
}

/** The earliest month (1-3) that still has un-generated ('planned') items. */
async function earliestPendingMonth(planId: number): Promise<number | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('plan_sections')
    .select('month, planned_content_items(status)')
    .eq('plan_id', planId);
  const pending = (data ?? [])
    .filter((s) => ((s.planned_content_items ?? []) as { status: string }[]).some((i) => i.status === 'planned'))
    .map((s) => s.month as number);
  return pending.length ? Math.min(...pending) : null;
}

async function markActive(planId: number): Promise<void> {
  const admin = createAdminClient();
  await admin.from('marketing_plans').update({ status: 'active' }).eq('id', planId).eq('status', 'approved');
}

export const generatePlanMonth = inngest.createFunction(
  {
    id: 'generate-plan-month',
    triggers: [
      { event: 'plan/month.generate' }, // on approval (Month 1)
      { cron: '0 9 * * 1' }, // weekly, Monday 09:00 UTC (roll forward)
    ],
  },
  async ({ event, step }) => {
    const req = event?.data as { planId?: number; month?: number; organizationId?: number } | undefined;

    // On-demand: a specific plan + month (plan approval fires this for month 1).
    if (req?.planId && req?.month && req?.organizationId) {
      const result = await step.run(`gen-plan-${req.planId}-m${req.month}`, () =>
        generateMonthContent(req.planId!, req.month!, req.organizationId!),
      );
      if (req.month === 1) await step.run(`activate-${req.planId}`, () => markActive(req.planId!));
      return { mode: 'on-demand', ...result };
    }

    // Weekly roll-forward: each active plan's earliest pending month.
    const plans = await step.run('list-active-plans', listActivePlans);
    const results = [];
    for (const plan of plans) {
      const month = await step.run(`pending-${plan.id}`, () => earliestPendingMonth(plan.id));
      if (month == null) continue;
      const result = await step.run(`gen-plan-${plan.id}-m${month}`, () =>
        generateMonthContent(plan.id, month, plan.organizationId),
      );
      results.push(result);
    }
    return { mode: 'cron', plans: plans.length, results };
  },
);
