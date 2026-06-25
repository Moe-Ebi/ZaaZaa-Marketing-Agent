// ============================================================================
// Module 10 planning test.
// ----------------------------------------------------------------------------
// Exercises the full plan loop deterministically (live Claude plan generation
// needs ANTHROPIC_API_KEY — that path is verified to fail gracefully):
//   • createPlanFromGeneration — persists plan + sections + planned items
//   • editPlanScript / reOrderPlanItem
//   • generateMonthContent (Month 1) — runs the planned pipeline, links the
//     produced content_item back to the planned item (the plan→content loop)
//   • generateMarketingPlan — graceful typed error without the API key
// Cleans up the plan + generated content afterward.
// ============================================================================
import './load-env';
import { createClient } from '@supabase/supabase-js';
import { generateMarketingPlan } from '../src/lib/adapters/planning/claude-plan-generator';
import {
  createPlanFromGeneration,
  getPlanDetail,
  editPlanScript,
  reOrderPlanItem,
} from '../src/lib/adapters/planning';
import { generateMonthContent } from '../src/lib/services/plan-content-generator';
import type { PlanGeneration } from '../src/lib/adapters/planning/types';

let failures = 0;
function check(label: string, ok: boolean, extra?: string) {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await admin.from('organizations').select('id').eq('slug', 'zaazaa').single();
  const orgId = org!.id as number;

  // A real product external id so the planned pipeline can resolve a product.
  const { data: product } = await admin
    .from('products')
    .select('woocommerce_id, title')
    .eq('organization_id', orgId)
    .not('image_url', 'is', null)
    .limit(1)
    .single();
  const externalId = String(product!.woocommerce_id);
  console.log(`Using product [${externalId}] "${product!.title}"\n`);

  // --- Build a generation object (what Claude would return) ---
  const mkWeek = (week: number) => ({
    week,
    theme: `Week ${week} theme`,
    product_external_ids: [externalId],
    key_hooks: ['Step into the season'],
    script_outline: 'Showcase the product with a seasonal angle.',
    hashtag_strategy: '#Zaazaa #SouthAfrica',
    items: [
      {
        format: 'reel' as const,
        hook: `Week ${week}: your new favourite kicks`,
        full_script: 'Light, comfy, and built for SA summers. Tag a friend who needs these.',
        platforms: ['instagram' as const, 'tiktok' as const],
        scheduled_offset_days: (week - 1) * 7,
      },
    ],
  });
  const generation: PlanGeneration = {
    plan_name: 'TEST Plan — Summer Sprint',
    months: [
      { month: 1, theme: 'Launch', weeks: [mkWeek(1)] },
      { month: 2, theme: 'Build', weeks: [mkWeek(1)] },
      { month: 3, theme: 'Convert', weeks: [mkWeek(1)] },
    ],
  };

  // --- 1. Persist ---
  console.log('Persist plan:');
  const planId = await createPlanFromGeneration(orgId, generation, {
    season: 'Summer 2026',
    marketingFocus: 'test',
    tier: 'small',
    startDate: new Date().toISOString().slice(0, 10),
  });
  const detail = await getPlanDetail(orgId, planId);
  check('plan created', detail !== null, `plan #${planId}`);
  check('3 months of sections', new Set((detail?.sections ?? []).map((s) => s.month)).size === 3);
  const firstItem = detail!.sections.find((s) => s.month === 1)!.items[0];
  check('planned items created', !!firstItem);

  // --- 2. Edit + reorder ---
  console.log('\nEdit + reorder:');
  await editPlanScript(firstItem.id, 'EDITED script for the test', 'EDITED hook');
  await reOrderPlanItem(firstItem.id, new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
  const afterEdit = await getPlanDetail(orgId, planId);
  const editedItem = afterEdit!.sections.find((s) => s.month === 1)!.items[0];
  check('script edit persisted', editedItem.hook === 'EDITED hook');
  check('reorder persisted', !!editedItem.scheduledDate);

  // --- 3. Plan -> content loop (Month 1) ---
  console.log('\nGenerate Month 1 content (plan → pipeline → content_item):');
  const before = (await admin.from('content_items').select('*', { count: 'exact', head: true }).eq('organization_id', orgId)).count ?? 0;
  const result = await generateMonthContent(planId, 1, orgId);
  console.log(`  → generated ${result.generated}, failed ${result.failed}`);
  check('at least one item generated', result.generated >= 1, `${result.generated}`);

  const linked = await getPlanDetail(orgId, planId);
  const linkedItem = linked!.sections.find((s) => s.month === 1)!.items[0];
  check('planned item linked to content_item', linkedItem.status === 'linked_to_content_item' && linkedItem.linkedContentItemId != null);

  const after = (await admin.from('content_items').select('*', { count: 'exact', head: true }).eq('organization_id', orgId)).count ?? 0;
  check('a content_item was produced', after > before, `${before} → ${after}`);

  if (linkedItem.linkedContentItemId) {
    const { data: ci } = await admin.from('content_items').select('state, final_video_urls').eq('id', linkedItem.linkedContentItemId).single();
    check('produced content is ready_for_review', ci?.state === 'ready_for_review', ci?.state);
    check('has per-platform MP4s', !!ci && Object.keys(ci.final_video_urls ?? {}).length > 0);
  }

  // --- 4. Claude generator graceful without key ---
  console.log('\nClaude generator (no API key → graceful error):');
  const gen = await generateMarketingPlan('Winter 2026', 'test', 'small', { bestsellers: [], newArrivals: [], all: [] });
  check('returns typed error, does not throw', !gen.ok, gen.ok ? 'unexpected ok' : gen.error);

  // --- cleanup ---
  if (linkedItem.linkedContentItemId) {
    await admin.from('content_items').delete().eq('id', linkedItem.linkedContentItemId);
  }
  await admin.from('marketing_plans').delete().eq('id', planId); // cascades sections + items

  console.log(`\n${failures === 0 ? '✓ PLANNING CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  console.log('(Note: live Claude plan generation needs ANTHROPIC_API_KEY in .env.local.)');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Planning test errored:\n', err.message);
  process.exit(1);
});
