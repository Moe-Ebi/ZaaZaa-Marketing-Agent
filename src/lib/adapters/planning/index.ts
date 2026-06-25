// ============================================================================
// Planning adapter (public interface).
// ----------------------------------------------------------------------------
// Persists a Claude-generated plan into marketing_plans / plan_sections /
// planned_content_items, and exposes approve / edit / reorder + read helpers for
// the dashboard. Tenant-scoped (explicit organization_id). Approving a plan
// enqueues Month 1 generation in Inngest (Rule 4).
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';
import type { PlanGeneration, PlanFormat, PlanPlatform } from './types';

export interface PlanSummary {
  id: number;
  name: string;
  season: string | null;
  status: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  monthProgress: Record<number, { total: number; generated: number }>;
}

export interface PlannedItem {
  id: number;
  format: PlanFormat;
  hook: string | null;
  fullScript: string | null;
  platforms: PlanPlatform[];
  scheduledDate: string | null;
  status: string;
  linkedContentItemId: number | null;
}

export interface PlanSection {
  id: number;
  month: number;
  week: number;
  theme: string | null;
  productExternalIds: string[];
  keyHooks: string[];
  scriptOutline: string | null;
  hashtagStrategy: string | null;
  items: PlannedItem[];
}

export interface PlanDetail extends PlanSummary {
  context: Record<string, unknown>;
  sections: PlanSection[];
}

const DAY = 86_400_000;

/** Insert a generated plan (+ sections + planned items). Returns the plan id. */
export async function createPlanFromGeneration(
  organizationId: number,
  generation: PlanGeneration,
  meta: { season: string; marketingFocus: string; tier: string; startDate: string },
): Promise<number> {
  const admin = createAdminClient();
  const start = new Date(meta.startDate);
  const end = new Date(start.getTime() + 90 * DAY);

  const { data: plan, error: planErr } = await admin
    .from('marketing_plans')
    .insert({
      organization_id: organizationId,
      name: generation.plan_name,
      season: meta.season,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      status: 'draft',
      context: { marketingFocus: meta.marketingFocus, tier: meta.tier },
    })
    .select('id')
    .single();
  if (planErr) throw new Error(`Failed to create plan: ${planErr.message}`);
  const planId = plan.id as number;

  for (const month of generation.months) {
    for (const week of month.weeks) {
      const { data: section, error: secErr } = await admin
        .from('plan_sections')
        .insert({
          plan_id: planId,
          month: month.month,
          week: week.week,
          theme: week.theme || month.theme,
          product_external_ids: week.product_external_ids,
          key_hooks: week.key_hooks,
          script_outline: week.script_outline,
          hashtag_strategy: week.hashtag_strategy,
        })
        .select('id')
        .single();
      if (secErr) throw new Error(`Failed to create plan section: ${secErr.message}`);

      const rows = week.items.map((it) => ({
        plan_section_id: section.id as number,
        format: it.format,
        hook: it.hook,
        full_script: it.full_script,
        platforms: it.platforms,
        scheduled_date: new Date(start.getTime() + it.scheduled_offset_days * DAY).toISOString().slice(0, 10),
        status: 'planned',
      }));
      if (rows.length > 0) {
        const { error: itErr } = await admin.from('planned_content_items').insert(rows);
        if (itErr) throw new Error(`Failed to create planned items: ${itErr.message}`);
      }
    }
  }

  return planId;
}

export async function assertPlanOrg(planId: number, organizationId: number): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('marketing_plans')
    .select('organization_id')
    .eq('id', planId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.organization_id !== organizationId) {
    throw new Error('Plan not found for this tenant');
  }
}

/** Approve a plan and enqueue Month 1 generation. */
export async function approvePlan(planId: number, organizationId: number, userId: string): Promise<void> {
  await assertPlanOrg(planId, organizationId);
  const admin = createAdminClient();
  const { error } = await admin
    .from('marketing_plans')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by_user_id: userId })
    .eq('id', planId);
  if (error) throw new Error(`Failed to approve plan: ${error.message}`);

  await inngest.send({
    name: 'plan/month.generate',
    data: { planId, month: 1, organizationId },
  });
}

/** Move a planned item to a new scheduled date. */
export async function reOrderPlanItem(planItemId: number, newScheduledDate: string): Promise<void> {
  const admin = createAdminClient();
  const when = new Date(newScheduledDate);
  if (Number.isNaN(when.getTime())) throw new Error('Invalid date');
  const { error } = await admin
    .from('planned_content_items')
    .update({ scheduled_date: when.toISOString().slice(0, 10) })
    .eq('id', planItemId);
  if (error) throw new Error(`Failed to reschedule item: ${error.message}`);
}

/** Edit a planned item's script + hook before (or after) generation. */
export async function editPlanScript(planItemId: number, newScript: string, newHook: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('planned_content_items')
    .update({ full_script: newScript, hook: newHook })
    .eq('id', planItemId);
  if (error) throw new Error(`Failed to edit plan script: ${error.message}`);
}

/** Reset a week's planned items back to 'planned' so they regenerate, and
 *  enqueue that month for generation. */
export async function regenerateWeek(
  planId: number,
  organizationId: number,
  month: number,
  week: number,
): Promise<void> {
  await assertPlanOrg(planId, organizationId);
  const admin = createAdminClient();
  const { data: section } = await admin
    .from('plan_sections')
    .select('id')
    .eq('plan_id', planId)
    .eq('month', month)
    .eq('week', week)
    .maybeSingle();
  if (!section) throw new Error('Week not found');

  await admin
    .from('planned_content_items')
    .update({ status: 'planned', linked_content_item_id: null })
    .eq('plan_section_id', section.id);

  await inngest.send({ name: 'plan/month.generate', data: { planId, month, organizationId } });
}

// --- reads ------------------------------------------------------------------

async function progressByMonth(planId: number): Promise<Record<number, { total: number; generated: number }>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('plan_sections')
    .select('month, planned_content_items(status)')
    .eq('plan_id', planId);
  const progress: Record<number, { total: number; generated: number }> = {};
  for (const sec of data ?? []) {
    const month = sec.month as number;
    const items = (sec.planned_content_items ?? []) as { status: string }[];
    progress[month] ??= { total: 0, generated: 0 };
    for (const it of items) {
      progress[month].total++;
      if (it.status === 'ready_for_review' || it.status === 'linked_to_content_item') {
        progress[month].generated++;
      }
    }
  }
  return progress;
}

export async function listPlans(organizationId: number): Promise<PlanSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('marketing_plans')
    .select('id, name, season, status, start_date, end_date, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list plans: ${error.message}`);

  const plans: PlanSummary[] = [];
  for (const p of data ?? []) {
    plans.push({
      id: p.id as number,
      name: p.name as string,
      season: p.season as string | null,
      status: p.status as string,
      startDate: p.start_date as string,
      endDate: p.end_date as string,
      createdAt: p.created_at as string,
      monthProgress: await progressByMonth(p.id as number),
    });
  }
  return plans;
}

export async function getPlanDetail(organizationId: number, planId: number): Promise<PlanDetail | null> {
  const admin = createAdminClient();
  const { data: p, error } = await admin
    .from('marketing_plans')
    .select('id, name, season, status, start_date, end_date, created_at, context')
    .eq('id', planId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return null;

  const { data: sections } = await admin
    .from('plan_sections')
    .select('id, month, week, theme, product_external_ids, key_hooks, script_outline, hashtag_strategy, planned_content_items(id, format, hook, full_script, platforms, scheduled_date, status, linked_content_item_id)')
    .eq('plan_id', planId)
    .order('month')
    .order('week');

  const mapped: PlanSection[] = (sections ?? []).map((s) => ({
    id: s.id as number,
    month: s.month as number,
    week: s.week as number,
    theme: s.theme as string | null,
    productExternalIds: (s.product_external_ids ?? []) as string[],
    keyHooks: (s.key_hooks ?? []) as string[],
    scriptOutline: s.script_outline as string | null,
    hashtagStrategy: s.hashtag_strategy as string | null,
    items: ((s.planned_content_items ?? []) as Record<string, unknown>[]).map((it) => ({
      id: it.id as number,
      format: it.format as PlanFormat,
      hook: it.hook as string | null,
      fullScript: it.full_script as string | null,
      platforms: (it.platforms ?? []) as PlanPlatform[],
      scheduledDate: it.scheduled_date as string | null,
      status: it.status as string,
      linkedContentItemId: it.linked_content_item_id as number | null,
    })),
  }));

  return {
    id: p.id as number,
    name: p.name as string,
    season: p.season as string | null,
    status: p.status as string,
    startDate: p.start_date as string,
    endDate: p.end_date as string,
    createdAt: p.created_at as string,
    context: (p.context ?? {}) as Record<string, unknown>,
    monthProgress: await progressByMonth(planId),
    sections: mapped,
  };
}
