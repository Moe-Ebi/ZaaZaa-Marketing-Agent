// ============================================================================
// Script & caption generation (OpenAI) — reads the brand voice profile.
// ----------------------------------------------------------------------------
// Rule 1: callers never touch OpenAI directly. Every call loads the tenant's
// brand_profiles.voice_profile (Module 4) and constrains the output by tone,
// do/don't rules, audience + prohibition keywords. Meters token usage (Rule 5).
// ============================================================================
import OpenAI from 'openai';
import { getBrandProfile } from '@/lib/brand';
import type { StoredBrandProfile } from '@/lib/brand';
import { recordUsage, checkTierAllowance } from './usage';
import type { GenerationResult, ScriptOutput, CaptionOutput } from './types';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

export interface ProductContext {
  name: string;
  description?: string;
  price?: number;
  currency?: string;
}

export interface ScriptInput {
  product?: ProductContext;
  contentType?: string; // e.g. "reel", "story"
  angle?: string; // e.g. "new arrival", "bestseller", "low-stock urgency"
}

function brandConstraints(p: StoredBrandProfile | null): string {
  if (!p) return 'No brand profile is set; use a friendly, neutral marketing tone.';
  const v = p.voiceProfile;
  const lines = [
    p.brandName ? `Brand: ${p.brandName}` : null,
    v.tone.length ? `Tone: ${v.tone.join(', ')}` : null,
    v.personality ? `Personality: ${v.personality}` : null,
    v.values.length ? `Values: ${v.values.join(', ')}` : null,
    p.targetAudience ? `Audience: ${p.targetAudience}` : null,
    v.audience_keywords.length ? `Audience keywords to lean into: ${v.audience_keywords.join(', ')}` : null,
    v.content_themes.length ? `Recurring themes: ${v.content_themes.join(', ')}` : null,
    p.doRules.length ? `DO: ${p.doRules.join('; ')}` : null,
    p.dontRules.length ? `DON'T: ${p.dontRules.join('; ')}` : null,
    v.prohibition_keywords.length ? `Never use these words/claims: ${v.prohibition_keywords.join(', ')}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function productBlock(p?: ProductContext): string {
  if (!p) return '(no specific product — keep it brand-level)';
  return [
    `Product: ${p.name}`,
    p.description ? `Description: ${p.description.replace(/<[^>]+>/g, ' ').slice(0, 600)}` : null,
    p.price != null ? `Price: ${p.currency ?? 'ZAR'} ${p.price}` : null,
  ].filter(Boolean).join('\n');
}

const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hook: { type: 'string' },
    body: { type: 'string' },
    cta: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    content_type: { type: 'string' },
  },
  required: ['hook', 'body', 'cta', 'hashtags', 'content_type'],
} as const;

const CAPTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
  },
  required: ['caption', 'hashtags'],
} as const;

function client(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

export async function generateScript(
  organizationId: number,
  input: ScriptInput = {},
): Promise<GenerationResult<ScriptOutput>> {
  const openai = client();
  if (!openai) return { ok: false, error: 'OPENAI_API_KEY is not set' };
  await checkTierAllowance(organizationId, 'script');

  const profile = await getBrandProfile(organizationId);
  const system = `You are a short-form social video scriptwriter. Write a punchy
script as JSON with a scroll-stopping hook, a concise body, a clear CTA, and
relevant hashtags. Obey the brand constraints exactly.\n\n${brandConstraints(profile)}`;
  const user = [
    productBlock(input.product),
    input.contentType ? `Format: ${input.contentType}` : 'Format: short-form reel',
    input.angle ? `Angle: ${input.angle}` : null,
  ].filter(Boolean).join('\n');

  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.8,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'script', strict: true, schema: SCRIPT_SCHEMA },
      },
    });
    const content = res.choices[0]?.message?.content;
    if (!content) return { ok: false, error: 'OpenAI returned an empty script' };
    const data = JSON.parse(content) as ScriptOutput;

    await recordUsage(organizationId, 'script', res.usage?.total_tokens ?? 0, input.product?.name);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Script generation failed: ${(err as Error).message}` };
  }
}

export async function generateCaption(
  organizationId: number,
  input: ScriptInput = {},
): Promise<GenerationResult<CaptionOutput>> {
  const openai = client();
  if (!openai) return { ok: false, error: 'OPENAI_API_KEY is not set' };
  await checkTierAllowance(organizationId, 'caption');

  const profile = await getBrandProfile(organizationId);
  const system = `You write social media captions as JSON. Keep it on-brand,
concise, and engaging with a natural CTA and a focused set of hashtags. Obey the
brand constraints exactly.\n\n${brandConstraints(profile)}`;
  const user = [productBlock(input.product), input.angle ? `Angle: ${input.angle}` : null]
    .filter(Boolean)
    .join('\n');

  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.8,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'caption', strict: true, schema: CAPTION_SCHEMA },
      },
    });
    const content = res.choices[0]?.message?.content;
    if (!content) return { ok: false, error: 'OpenAI returned an empty caption' };
    const data = JSON.parse(content) as CaptionOutput;

    await recordUsage(organizationId, 'caption', res.usage?.total_tokens ?? 0, input.product?.name);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Caption generation failed: ${(err as Error).message}` };
  }
}
