'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  getProducts,
  getBestsellers,
  getNewArrivals,
} from '@/lib/adapters/commerce';
import { generateMarketingPlan } from '@/lib/adapters/planning/claude-plan-generator';
import {
  createPlanFromGeneration,
  approvePlan as approvePlanAdapter,
  reOrderPlanItem,
  editPlanScript,
  assertPlanOrg,
  regenerateWeek as regenerateWeekAdapter,
} from '@/lib/adapters/planning';
import type { Catalog, CatalogProduct, BudgetTier } from '@/lib/adapters/planning/types';

export type PlanActionResult = { ok: boolean; message: string; planId?: number };

function toCatalogProduct(p: { externalId: string; name: string; price: number }): CatalogProduct {
  return { externalId: p.externalId, name: p.name, price: p.price };
}

/** Generate a plan with Claude, persist it (status draft), return the plan id. */
export async function generatePlan(
  season: string,
  marketingFocus: string,
  tier: BudgetTier,
  videoStrategy: 'carousel' | 'lifestyle' | 'product_motion' = 'carousel',
): Promise<PlanActionResult> {
  const ctx = await requireTenantContext();
  if (!season.trim() || !marketingFocus.trim()) {
    return { ok: false, message: 'Season and marketing focus are required' };
  }

  const [allRes, bestRes, newRes] = await Promise.all([
    getProducts(ctx.tenantId),
    getBestsellers(ctx.tenantId, 15),
    getNewArrivals(ctx.tenantId, 30),
  ]);
  const all = allRes.ok ? allRes.data : [];
  if (all.length === 0) {
    return { ok: false, message: 'No products in cache — run a WooCommerce sync first' };
  }
  const catalog: Catalog = {
    bestsellers: (bestRes.ok ? bestRes.data : []).map(toCatalogProduct),
    newArrivals: (newRes.ok ? newRes.data : []).map(toCatalogProduct),
    all: all.map(toCatalogProduct),
  };

  const gen = await generateMarketingPlan(season, marketingFocus, tier, catalog);
  if (!gen.ok) return { ok: false, message: gen.error };

  try {
    const planId = await createPlanFromGeneration(ctx.tenantId, gen.data, {
      season,
      marketingFocus,
      tier,
      startDate: new Date().toISOString().slice(0, 10),
      videoStrategy,
    });
    revalidatePath('/dashboard/plans');
    return { ok: true, message: `Plan "${gen.data.plan_name}" generated.`, planId };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function approvePlan(planId: number): Promise<PlanActionResult> {
  const ctx = await requireTenantContext();
  try {
    await approvePlanAdapter(planId, ctx.tenantId, ctx.userId);
    revalidatePath('/dashboard/plans');
    revalidatePath(`/dashboard/plans/${planId}/view`);
    return { ok: true, message: 'Plan approved — Month 1 generation queued.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function editItemScript(
  planId: number,
  itemId: number,
  newScript: string,
  newHook: string,
): Promise<PlanActionResult> {
  const ctx = await requireTenantContext();
  try {
    await assertPlanOrg(planId, ctx.tenantId);
    await editPlanScript(itemId, newScript, newHook);
    revalidatePath(`/dashboard/plans/${planId}/view`);
    return { ok: true, message: 'Saved.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function regenerateWeek(
  planId: number,
  month: number,
  week: number,
): Promise<PlanActionResult> {
  const ctx = await requireTenantContext();
  try {
    await regenerateWeekAdapter(planId, ctx.tenantId, month, week);
    revalidatePath(`/dashboard/plans/${planId}/view`);
    return { ok: true, message: `Week ${week} regeneration queued.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function reorderItem(
  planId: number,
  itemId: number,
  newDate: string,
): Promise<PlanActionResult> {
  const ctx = await requireTenantContext();
  try {
    await assertPlanOrg(planId, ctx.tenantId);
    await reOrderPlanItem(itemId, newDate);
    revalidatePath(`/dashboard/plans/${planId}/view`);
    return { ok: true, message: 'Rescheduled.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
