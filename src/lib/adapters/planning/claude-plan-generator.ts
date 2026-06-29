// ============================================================================
// Claude plan generator (private to the planning adapter).
// ----------------------------------------------------------------------------
// Rule 1: the app never calls Anthropic directly. This calls the Messages API
// over raw HTTP (per the module brief) with structured outputs (json_schema) so
// the 3-month plan comes back in a fixed, Zod-validated shape. Model is Claude
// Opus 4.8 with adaptive thinking. Typed errors on missing key / API failure /
// refusal / truncation so the operator can retry.
// ============================================================================
import {
  PlanGenerationSchema,
  type PlanGeneration,
  type PlanningResult,
  type Catalog,
  type BudgetTier,
} from './types';

const API_URL = process.env.ANTHROPIC_API_URL ?? 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8';

// JSON schema mirrors PlanGenerationSchema; strict (additionalProperties:false,
// all properties required) per Anthropic structured-output rules.
// Exported so the plan extractor (uploaded plans) reuses the exact same shape.
export const PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    plan_name: { type: 'string' },
    months: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          month: { type: 'integer' },
          theme: { type: 'string' },
          weeks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                week: { type: 'integer' },
                theme: { type: 'string' },
                product_external_ids: { type: 'array', items: { type: 'string' } },
                key_hooks: { type: 'array', items: { type: 'string' } },
                script_outline: { type: 'string' },
                hashtag_strategy: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      format: { type: 'string', enum: ['carousel', 'reel', 'story', 'single'] },
                      hook: { type: 'string' },
                      full_script: { type: 'string' },
                      platforms: {
                        type: 'array',
                        items: { type: 'string', enum: ['instagram', 'tiktok', 'facebook'] },
                      },
                      scheduled_offset_days: { type: 'integer' },
                    },
                    required: ['format', 'hook', 'full_script', 'platforms', 'scheduled_offset_days'],
                  },
                },
              },
              required: ['week', 'theme', 'product_external_ids', 'key_hooks', 'script_outline', 'hashtag_strategy', 'items'],
            },
          },
        },
        required: ['month', 'theme', 'weeks'],
      },
    },
  },
  required: ['plan_name', 'months'],
} as const;

const SYSTEM_PROMPT = `You are a senior social-media marketing strategist. Produce
a concrete, executable 3-month content plan as structured JSON. Rules:
- Exactly 3 months. Each month has 1-4 weeks; each week has 1-3 content items.
- Use ONLY product external IDs from the supplied catalog; never invent IDs.
- Feature bestsellers, lean on new arrivals, and create urgency for low-stock items.
- Each item: a scroll-stopping hook, a short full_script (40-90 words), platforms,
  and scheduled_offset_days = whole days after the plan start date for that post.
- Keep it on-brand, specific, and varied across formats. No filler.`;

function catalogBlock(catalog: Catalog): string {
  const fmt = (ps: Catalog['all']) =>
    ps.slice(0, 40).map((p) => `- [${p.externalId}] ${p.name} (R${p.price})`).join('\n') || '(none)';
  return [
    'BESTSELLERS:', fmt(catalog.bestsellers),
    '', 'NEW ARRIVALS:', fmt(catalog.newArrivals),
    '', 'CATALOG SAMPLE:', fmt(catalog.all),
  ].join('\n');
}

export async function generateMarketingPlan(
  season: string,
  marketingFocus: string,
  tier: BudgetTier,
  catalog: Catalog,
): Promise<PlanningResult<PlanGeneration>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY is not set' };

  const userPrompt = [
    `Season / campaign: ${season}`,
    `Marketing focus: ${marketingFocus}`,
    `Budget tier: ${tier} (small = ~1 item/week, medium = ~2, large = ~3)`,
    '',
    'PRODUCT CATALOG (use these external IDs):',
    catalogBlock(catalog),
  ].join('\n');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        output_config: { format: { type: 'json_schema', schema: PLAN_JSON_SCHEMA } },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Anthropic ${res.status}: ${text.slice(0, 300)}` };
    }

    const body = JSON.parse(text) as {
      stop_reason?: string;
      content?: { type: string; text?: string }[];
    };
    if (body.stop_reason === 'refusal') {
      return { ok: false, error: 'Claude declined to generate this plan' };
    }
    if (body.stop_reason === 'max_tokens') {
      return { ok: false, error: 'Plan was truncated (max_tokens) — try a smaller focus' };
    }

    // Structured output lands in the text block (thinking blocks come first).
    const jsonText = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    if (!jsonText) return { ok: false, error: 'Empty response from Claude' };

    const parsed = PlanGenerationSchema.safeParse(JSON.parse(jsonText));
    if (!parsed.success) {
      return { ok: false, error: `Plan failed validation: ${parsed.error.issues[0]?.message}` };
    }
    return { ok: true, data: parsed.data };
  } catch (err) {
    return { ok: false, error: `Plan generation failed: ${(err as Error).message}` };
  }
}
