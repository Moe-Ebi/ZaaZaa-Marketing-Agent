'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  getProducts,
  getBestsellers,
  getNewArrivals,
} from '@/lib/adapters/commerce';
import { generateMarketingPlan } from '@/lib/adapters/planning/claude-plan-generator';
import { extractMarketingPlan } from '@/lib/adapters/planning/claude-plan-extractor';
import {
  createPlanFromGeneration,
  approvePlan as approvePlanAdapter,
  reOrderPlanItem,
  editPlanScript,
  assertPlanOrg,
  regenerateWeek as regenerateWeekAdapter,
} from '@/lib/adapters/planning';
import type { Catalog, CatalogProduct, BudgetTier, PlanBrief, PlanPlatform } from '@/lib/adapters/planning/types';

export type WizardAnswers = {
  primaryGoal: string;
  season: string;
  keyDates?: string;
  targetAudience?: string;
  tone?: string;
  platforms: PlanPlatform[];
  cadence: 'light' | 'medium' | 'heavy';
  contentMix?: string;
  videoStrategy: 'carousel' | 'lifestyle' | 'product_motion';
  featuredFocus?: string;
};

const CADENCE_TIER: Record<WizardAnswers['cadence'], BudgetTier> = {
  light: 'small',
  medium: 'medium',
  heavy: 'large',
};

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

async function buildCatalog(tenantId: number): Promise<Catalog | null> {
  const [allRes, bestRes, newRes] = await Promise.all([
    getProducts(tenantId),
    getBestsellers(tenantId, 15),
    getNewArrivals(tenantId, 30),
  ]);
  const all = allRes.ok ? allRes.data : [];
  if (all.length === 0) return null;
  return {
    bestsellers: (bestRes.ok ? bestRes.data : []).map(toCatalogProduct),
    newArrivals: (newRes.ok ? newRes.data : []).map(toCatalogProduct),
    all: all.map(toCatalogProduct),
  };
}

/**
 * Upload an existing plan (PDF / DOCX / TXT or pasted text) → Claude extracts it
 * into the standard plan shape → saved as a draft for review (same as generated).
 */
export async function uploadPlan(formData: FormData): Promise<PlanActionResult> {
  const ctx = await requireTenantContext();
  const season = String(formData.get('season') ?? '').trim();
  const marketingFocus = String(formData.get('marketingFocus') ?? '').trim();
  const pasted = String(formData.get('pastedText') ?? '').trim();
  const file = formData.get('file');

  let text: string | undefined;
  let pdfBase64: string | undefined;

  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > 15 * 1024 * 1024) return { ok: false, message: 'File must be under 15 MB' };
      const buffer = Buffer.from(await file.arrayBuffer());
      const name = file.name.toLowerCase();
      if (name.endsWith('.pdf') || file.type === 'application/pdf') {
        pdfBase64 = buffer.toString('base64');
      } else if (name.endsWith('.docx') || file.type.includes('word') || file.type.includes('officedocument')) {
        const mammoth = (await import('mammoth')).default;
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else {
        text = buffer.toString('utf8'); // .txt / plain
      }
    } else if (pasted) {
      text = pasted;
    } else {
      return { ok: false, message: 'Upload a file or paste the plan text' };
    }
  } catch (err) {
    return { ok: false, message: `Could not read document: ${(err as Error).message}` };
  }

  if (!text?.trim() && !pdfBase64) {
    return { ok: false, message: 'The document appears to be empty' };
  }

  const catalog = await buildCatalog(ctx.tenantId);
  if (!catalog) return { ok: false, message: 'No products in cache — run a WooCommerce sync first' };

  const extracted = await extractMarketingPlan({ text, pdfBase64, catalog, season, marketingFocus });
  if (!extracted.ok) return { ok: false, message: extracted.error };

  try {
    const planId = await createPlanFromGeneration(ctx.tenantId, extracted.data, {
      season: season || 'Uploaded plan',
      marketingFocus: marketingFocus || 'imported',
      tier: 'medium',
      startDate: new Date().toISOString().slice(0, 10),
    });
    revalidatePath('/dashboard/plans');
    return { ok: true, message: `Imported "${extracted.data.plan_name}".`, planId };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Guided questionnaire → rich brief → Claude generator → saved draft. */
export async function generatePlanFromWizard(answers: WizardAnswers): Promise<PlanActionResult> {
  const ctx = await requireTenantContext();
  if (!answers.primaryGoal || !answers.season.trim()) {
    return { ok: false, message: 'Primary goal and season are required' };
  }

  const catalog = await buildCatalog(ctx.tenantId);
  if (!catalog) return { ok: false, message: 'No products in cache — run a WooCommerce sync first' };

  const tier = CADENCE_TIER[answers.cadence] ?? 'medium';
  const marketingFocus = [
    answers.primaryGoal,
    answers.featuredFocus ? `Feature: ${answers.featuredFocus}.` : '',
    answers.keyDates ? `Plan around: ${answers.keyDates}.` : '',
  ].filter(Boolean).join(' ');

  const brief: PlanBrief = {
    primaryGoal: answers.primaryGoal,
    targetAudience: answers.targetAudience,
    tone: answers.tone,
    platforms: answers.platforms,
    cadence: answers.cadence,
    contentMix: answers.contentMix,
    keyDates: answers.keyDates,
    featuredFocus: answers.featuredFocus,
  };

  const gen = await generateMarketingPlan(answers.season, marketingFocus, tier, catalog, brief);
  if (!gen.ok) return { ok: false, message: gen.error };

  try {
    const planId = await createPlanFromGeneration(ctx.tenantId, gen.data, {
      season: answers.season,
      marketingFocus,
      tier,
      startDate: new Date().toISOString().slice(0, 10),
      videoStrategy: answers.videoStrategy,
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
