// ============================================================================
// PLAN step — OpenAI decides what to make, constrained by brand + commerce signals.
// ----------------------------------------------------------------------------
// Given the brand voice profile and a set of candidate products (tagged with
// bestseller / new-arrival / low-stock signals from the SENSE step), the model
// picks a format, a product to feature, a hook angle, and TWO A/B hook variants.
// Meters the OpenAI call (Rule 5).
// ============================================================================
import OpenAI from 'openai';
import type { StoredBrandProfile } from '@/lib/brand';
import { recordUsage } from '@/lib/adapters/generation';
import type { GenerationResult } from '@/lib/adapters/generation';
import type { PlanOutput } from './types';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

export interface PlanCandidate {
  externalId: string;
  name: string;
  price?: number;
  signals: string[]; // e.g. ["bestseller"], ["new_arrival"], ["low_stock"]
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    format: { type: 'string', enum: ['reel', 'story', 'tiktok', 'carousel'] },
    product_external_id: { type: 'string' },
    hook_angle: { type: 'string' },
    rationale: { type: 'string' },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          variant_type: { type: 'string' },
          hook: { type: 'string' },
        },
        required: ['variant_type', 'hook'],
      },
    },
  },
  required: ['format', 'product_external_id', 'hook_angle', 'rationale', 'variants'],
} as const;

function brandSummary(p: StoredBrandProfile | null): string {
  if (!p) return 'No brand profile set; assume a friendly, value-focused tone.';
  const v = p.voiceProfile;
  return [
    p.brandName ? `Brand: ${p.brandName}` : null,
    v.tone.length ? `Tone: ${v.tone.join(', ')}` : null,
    p.targetAudience ? `Audience: ${p.targetAudience}` : null,
    v.content_themes.length ? `Themes: ${v.content_themes.join(', ')}` : null,
    p.dontRules.length ? `Avoid: ${p.dontRules.join('; ')}` : null,
  ].filter(Boolean).join('\n');
}

export async function planContent(
  organizationId: number,
  brandProfile: StoredBrandProfile | null,
  candidates: PlanCandidate[],
): Promise<GenerationResult<PlanOutput>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY is not set' };
  if (candidates.length === 0) return { ok: false, error: 'No candidate products to plan from' };

  const openai = new OpenAI({ apiKey });
  const candidateBlock = candidates
    .map((c) => `- id=${c.externalId} | ${c.name}${c.price ? ` (R${c.price})` : ''} | signals: ${c.signals.join(', ') || 'none'}`)
    .join('\n');

  const system = `You are a social media content strategist. Choose ONE product
to feature and design a short-form post. Prefer products with strong signals
(bestseller, new_arrival, low_stock → urgency). Pick product_external_id ONLY
from the provided list. Produce exactly TWO hook variants (variant_type "a_hook"
and "b_hook") testing different angles. Stay on brand.\n\n${brandSummary(brandProfile)}`;

  const user = `Candidate products:\n${candidateBlock}\n\nDecide the format, the product to feature, the hook angle, a one-line rationale, and the two A/B hooks.`;

  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.9, // variety across runs (different plans/hooks each time)
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'content_plan', strict: true, schema: PLAN_SCHEMA },
      },
    });
    const content = res.choices[0]?.message?.content;
    if (!content) return { ok: false, error: 'OpenAI returned an empty plan' };
    const plan = JSON.parse(content) as PlanOutput;

    // Guard: ensure the chosen product is actually a candidate.
    if (!candidates.some((c) => c.externalId === plan.product_external_id)) {
      plan.product_external_id = candidates[0].externalId;
    }
    // Guard: ensure exactly two variants.
    if (!Array.isArray(plan.variants) || plan.variants.length < 2) {
      return { ok: false, error: 'PLAN did not return two hook variants' };
    }

    await recordUsage(organizationId, 'script', res.usage?.total_tokens ?? 0, 'plan');
    return { ok: true, data: plan };
  } catch (err) {
    return { ok: false, error: `PLAN failed: ${(err as Error).message}` };
  }
}
