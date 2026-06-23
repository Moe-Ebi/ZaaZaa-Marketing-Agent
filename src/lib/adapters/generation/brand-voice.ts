// ============================================================================
// Brand-voice distillation (OpenAI) — private to the generation adapter.
// ----------------------------------------------------------------------------
// CLAUDE.md Rule 1: the rest of the app never calls OpenAI directly. This module
// takes a brand's past content + guidelines and returns a STRUCTURED voice
// profile (not free text) using OpenAI structured outputs, validated with Zod.
// The raw guidelines are never logged (POPIA). On any failure it returns a typed
// error so the operator can retry.
// ============================================================================
import OpenAI from 'openai';
import { VoiceProfileSchema, type VoiceProfile } from '@/lib/brand/types';
import type { GenerationResult } from './index';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

// JSON schema mirrors VoiceProfileSchema; strict mode forces all fields present.
const VOICE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tone: { type: 'array', items: { type: 'string' } },
    values: { type: 'array', items: { type: 'string' } },
    personality: { type: 'string' },
    content_themes: { type: 'array', items: { type: 'string' } },
    audience_keywords: { type: 'array', items: { type: 'string' } },
    prohibition_keywords: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'tone',
    'values',
    'personality',
    'content_themes',
    'audience_keywords',
    'prohibition_keywords',
  ],
} as const;

const SYSTEM_PROMPT = `You are a senior brand strategist. Given a brand's past
social content and its written guidelines, extract a precise, structured brand
voice profile. Be specific and concrete — base every field on evidence in the
inputs, not generic marketing filler. Keep arrays focused (3-8 items each).`;

export async function distillBrandVoice(
  pastContentSamples: string[],
  guidelinesText: string,
): Promise<GenerationResult<VoiceProfile>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'OPENAI_API_KEY is not set' };
  }
  if (pastContentSamples.length === 0 && !guidelinesText.trim()) {
    return { ok: false, error: 'Provide at least some past content or guidelines to analyze' };
  }

  const client = new OpenAI({ apiKey });

  const samplesBlock = pastContentSamples
    .map((s, i) => `Sample ${i + 1}:\n${s}`)
    .join('\n\n');

  const userPrompt = [
    'BRAND GUIDELINES:',
    guidelinesText.trim() || '(none provided)',
    '',
    'PAST CONTENT SAMPLES:',
    samplesBlock || '(none provided)',
  ].join('\n');

  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'voice_profile', strict: true, schema: VOICE_JSON_SCHEMA },
      },
    });

    const content = res.choices[0]?.message?.content;
    if (!content) {
      return { ok: false, error: 'OpenAI returned an empty response' };
    }

    // Validate the model output against our schema before trusting it.
    const parsed = VoiceProfileSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return { ok: false, error: `Model output failed validation: ${parsed.error.issues[0]?.message}` };
    }
    return { ok: true, data: parsed.data };
  } catch (err) {
    // Note: deliberately do NOT include the raw guidelines/samples in the error.
    return { ok: false, error: `Brand voice distillation failed: ${(err as Error).message}` };
  }
}
