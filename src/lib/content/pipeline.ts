// ============================================================================
// Content pipeline: SENSE -> PLAN -> GENERATE -> REVIEW.
// ----------------------------------------------------------------------------
// Orchestrates the Module 5 adapters using the brand profile (Module 4) and the
// WooCommerce product cache (Module 3). Resilient by design: a failed AI image/
// video does not crash the run — it falls back to the product's real photo so a
// usable MP4 is still assembled, and the degradation is recorded. Hard failures
// (script/assembly) move the item to failed_retryable. Returns the final item.
// ============================================================================
import { getBrandProfile } from '@/lib/brand';
import {
  getProducts,
  getBestsellers,
  getNewArrivals,
  type Product,
} from '@/lib/adapters/commerce';
import {
  generateScript,
  generateImage,
  generateVideo,
  generateVoiceover,
  assembleVideo,
  type Platform,
  type ScriptOutput,
} from '@/lib/adapters/generation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDraft, transitionState, addVariant } from './index';
import { planContent, type PlanCandidate } from './plan';
import type { ContentItem, PlanOutput } from './types';

const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'facebook'];

export interface PipelineOptions {
  productId?: number; // force a specific cached product (by products.id)
}

export async function runContentGeneration(
  organizationId: number,
  options: PipelineOptions = {},
): Promise<ContentItem> {
  // --- create item + move to generating ---
  const draft = await createDraft(organizationId, options.productId);
  let item = await transitionState(draft.id, 'generating');

  try {
    // --- 1. SENSE: gather commerce signals ---
    const [allRes, bestRes, newRes] = await Promise.all([
      getProducts(organizationId),
      getBestsellers(organizationId, 10),
      getNewArrivals(organizationId, 30),
    ]);
    const all = allRes.ok ? allRes.data : [];
    if (all.length === 0) {
      return transitionState(item.id, 'failed_retryable', { error: 'No products in cache — run a WooCommerce sync first' });
    }
    const bestIds = new Set((bestRes.ok ? bestRes.data : []).map((p) => p.externalId));
    const newIds = new Set((newRes.ok ? newRes.data : []).map((p) => p.externalId));

    const byExternalId = new Map(all.map((p) => [p.externalId, p]));
    const forcedExternalId = options.productId
      ? await externalIdForProduct(organizationId, options.productId)
      : undefined;
    const candidates = buildCandidates(all, bestIds, newIds, forcedExternalId);

    // --- 2. PLAN ---
    const brand = await getBrandProfile(organizationId);
    const planRes = await planContent(organizationId, brand, candidates);
    if (!planRes.ok) {
      return transitionState(item.id, 'failed_retryable', { error: planRes.error });
    }
    const plan = planRes.data;
    const product = byExternalId.get(plan.product_external_id) ?? all[0];

    // link the cached product row + persist the plan
    await linkProduct(item.id, organizationId, product.externalId);
    item = await transitionState(item.id, 'generating', {
      format: plan.format,
      hookAngle: plan.hook_angle,
      plan,
    });

    // --- 3. GENERATE ---
    const productCtx = {
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
    };

    // 3a. Two script variants anchored to the planned A/B hooks.
    const variantScripts: { variantType: string; hook: string; script: ScriptOutput }[] = [];
    for (const v of plan.variants.slice(0, 2)) {
      const s = await generateScript(organizationId, {
        product: productCtx,
        contentType: plan.format,
        angle: plan.hook_angle,
        hook: v.hook,
      });
      if (!s.ok) {
        return transitionState(item.id, 'failed_retryable', { error: `Script failed: ${s.error}` });
      }
      variantScripts.push({ variantType: v.variant_type, hook: v.hook, script: s.data });
    }
    const primary = variantScripts[0];

    // 3b. AI image (Higgsfield). On failure, fall back to the product photo so
    //     we still produce a deliverable; record the degradation.
    let imageUrl = product.imageUrls[0] ?? null;
    let degraded: string | null = null;
    const img = await generateImage(organizationId, {
      prompt: `${plan.hook_angle} lifestyle shot featuring ${product.name}`,
      brandColors: (brand?.brandColors ?? []).map((c) => (typeof c === 'string' ? c : c.hex)),
    });
    if (img.ok) {
      imageUrl = img.data.url;
    } else {
      degraded = `AI image unavailable (${img.error}); used product photo`;
      console.warn(`[pipeline] item ${item.id}: ${degraded}`);
    }

    // 3c. AI video (optional — needs an image; best-effort).
    let videoUrl: string | null = null;
    if (imageUrl) {
      const vid = await generateVideo(organizationId, {
        imageUrl,
        prompt: `${plan.hook_angle} — dynamic reveal of ${product.name}`,
        durationSeconds: 5,
      });
      if (vid.ok) videoUrl = vid.data.url;
      else console.warn(`[pipeline] item ${item.id}: AI video skipped (${vid.error})`);
    }

    // 3d. Voiceover (OpenAI TTS).
    let voiceoverUrl: string | null = null;
    const vo = await generateVoiceover(organizationId, {
      text: `${primary.script.hook} ${primary.script.cta}`,
      tone: (brand?.voiceProfile.tone ?? []).join(', '),
    });
    if (vo.ok) voiceoverUrl = vo.data.url;
    else console.warn(`[pipeline] item ${item.id}: voiceover skipped (${vo.error})`);

    if (!imageUrl && !videoUrl) {
      return transitionState(item.id, 'waiting_for_credits', {
        error: 'No visual asset available (AI generation blocked and no product photo)',
        script: primary.script,
      });
    }

    // 3e. Assemble a per-platform MP4 (parallel renders).
    const assets = videoUrl
      ? [{ type: 'video' as const, src: videoUrl }]
      : [{ type: 'image' as const, src: imageUrl!, lengthSeconds: 4 }];

    const renders = await Promise.all(
      PLATFORMS.map(async (platform) => {
        const r = await assembleVideo(organizationId, {
          platform,
          assets,
          captions: [primary.script.hook, primary.script.cta],
          musicUrl: voiceoverUrl ?? undefined,
        });
        return [platform, r] as const;
      }),
    );

    const finalVideoUrls: Partial<Record<Platform, string>> = {};
    const renderErrors: string[] = [];
    for (const [platform, r] of renders) {
      if (r.ok) finalVideoUrls[platform] = r.data.url;
      else renderErrors.push(`${platform}: ${r.error}`);
    }
    if (Object.keys(finalVideoUrls).length === 0) {
      return transitionState(item.id, 'failed_retryable', {
        error: `All assembly renders failed — ${renderErrors.join('; ')}`,
        script: primary.script,
      });
    }

    // store variants
    for (const v of variantScripts) {
      await addVariant({
        contentItemId: item.id,
        organizationId,
        variantType: v.variantType,
        hook: v.hook,
        script: v.script,
        imageUrl,
      });
    }

    // --- 4. REVIEW ---
    return transitionState(item.id, 'ready_for_review', {
      script: primary.script,
      imageUrl,
      videoUrl,
      voiceoverUrl,
      finalVideoUrls,
      error: degraded ?? (renderErrors.length ? renderErrors.join('; ') : null),
    });
  } catch (err) {
    // Never crash the batch — mark retryable and let the caller move on.
    return transitionState(item.id, 'failed_retryable', { error: (err as Error).message });
  }
}

function buildCandidates(
  all: Product[],
  bestIds: Set<string>,
  newIds: Set<string>,
  forcedExternalId: string | undefined,
): PlanCandidate[] {
  const signalFor = (p: Product): string[] => {
    const s: string[] = [];
    if (bestIds.has(p.externalId)) s.push('bestseller');
    if (newIds.has(p.externalId)) s.push('new_arrival');
    if (p.inStock && p.stockQuantity != null && p.stockQuantity > 0 && p.stockQuantity <= 5) {
      s.push('low_stock');
    }
    return s;
  };

  // If the operator forced a product, plan around just that one.
  if (forcedExternalId) {
    const forced = all.find((p) => p.externalId === forcedExternalId);
    if (forced) {
      return [{ externalId: forced.externalId, name: forced.name, price: forced.price, signals: signalFor(forced) }];
    }
  }

  // Prefer products with signals; cap the list to keep the prompt tight.
  const withSignals = all.filter((p) => signalFor(p).length > 0);
  const pool = (withSignals.length >= 5 ? withSignals : all).slice(0, 25);

  return pool.map((p) => ({
    externalId: p.externalId,
    name: p.name,
    price: p.price,
    signals: signalFor(p),
  }));
}

async function externalIdForProduct(organizationId: number, productId: number): Promise<string | undefined> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('products')
    .select('woocommerce_id')
    .eq('organization_id', organizationId)
    .eq('id', productId)
    .maybeSingle();
  return data?.woocommerce_id != null ? String(data.woocommerce_id) : undefined;
}

// Resolve the cached products.id for a WooCommerce external id and link it.
async function linkProduct(itemId: number, organizationId: number, externalId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('products')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('woocommerce_id', Number(externalId))
    .maybeSingle();
  if (data?.id) {
    await admin.from('content_items').update({ product_id: data.id }).eq('id', itemId);
  }
}

export type { PlanOutput };
