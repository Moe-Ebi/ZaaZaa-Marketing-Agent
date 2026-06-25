// ============================================================================
// Plan content generator (Module 10 → Module 6 bridge).
// ----------------------------------------------------------------------------
// For each planned_content_item in a plan month, runs the content pipeline in
// "planned" mode (skips SENSE/PLAN — format/hook/script come from the plan),
// links the produced content_item back to the planned item, and advances its
// status. Per-item failures are isolated; failed items revert to 'planned' so
// the rolling cron retries them next run.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import { runPlannedGeneration } from '@/lib/content/pipeline';
import type { PlanPlatform } from '@/lib/adapters/planning/types';

export interface MonthGenerationResult {
  planId: number;
  month: number;
  generated: number;
  failed: number;
}

export async function generateMonthContent(
  planId: number,
  month: number,
  organizationId: number,
): Promise<MonthGenerationResult> {
  const admin = createAdminClient();

  const { data: sections, error } = await admin
    .from('plan_sections')
    .select('id, product_external_ids, planned_content_items(id, format, hook, full_script, platforms, status)')
    .eq('plan_id', planId)
    .eq('month', month);
  if (error) throw new Error(`Failed to load plan month: ${error.message}`);

  let generated = 0;
  let failed = 0;

  for (const section of sections ?? []) {
    const productIds = (section.product_external_ids ?? []) as string[];
    const items = ((section.planned_content_items ?? []) as Record<string, unknown>[]).filter(
      (it) => it.status === 'planned',
    );

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const itemId = it.id as number;
      const productExternalId = productIds[i % Math.max(productIds.length, 1)] ?? '';

      await admin.from('planned_content_items').update({ status: 'generating' }).eq('id', itemId);
      try {
        const content = await runPlannedGeneration(organizationId, {
          productExternalId,
          format: it.format as string,
          hook: (it.hook as string) ?? '',
          fullScript: (it.full_script as string) ?? '',
          platforms: (it.platforms ?? []) as PlanPlatform[],
        });

        if (content.state === 'ready_for_review') {
          await admin
            .from('planned_content_items')
            .update({ status: 'linked_to_content_item', linked_content_item_id: content.id })
            .eq('id', itemId);
          generated++;
        } else {
          // pipeline degraded (e.g. waiting_for_credits) — still link, but count as failed
          await admin
            .from('planned_content_items')
            .update({ status: 'planned', linked_content_item_id: content.id })
            .eq('id', itemId);
          failed++;
        }
      } catch (err) {
        console.warn(`[plan] item ${itemId} generation failed: ${(err as Error).message}`);
        await admin.from('planned_content_items').update({ status: 'planned' }).eq('id', itemId);
        failed++;
      }
    }
  }

  return { planId, month, generated, failed };
}
