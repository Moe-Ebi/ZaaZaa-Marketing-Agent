// ============================================================================
// Claude plan extractor — turn an EXISTING marketing plan (text or PDF) into our
// structured PlanGeneration shape. Rule 1: app never calls Anthropic directly.
// Reuses the exact same json_schema as the generator so the result drops straight
// into createPlanFromGeneration. DOCX is converted to text upstream (mammoth);
// PDF is sent natively as a document block (Claude reads PDFs directly).
// ============================================================================
import { PLAN_JSON_SCHEMA } from './claude-plan-generator';
import { PlanGenerationSchema, type PlanGeneration, type PlanningResult, type Catalog } from './types';

const API_URL = process.env.ANTHROPIC_API_URL ?? 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8';

const SYSTEM_PROMPT = `You convert an EXISTING marketing plan document into our
structured 3-month plan schema. Stay faithful to the uploaded plan — extract its
real themes, cadence, hooks and ideas rather than inventing a new plan. Map any
products mentioned to the supplied catalog's external IDs when you can match them
(by name); otherwise leave product_external_ids empty for that section. Organise
into up to 3 months and 1-4 weeks each, with concrete content items
(format, hook, a short full_script, platforms, scheduled_offset_days = whole days
from the plan start). If the document lacks detail, infer sensibly but keep it
recognisably the same plan.`;

function catalogBlock(catalog: Catalog): string {
  const fmt = (ps: Catalog['all']) =>
    ps.slice(0, 40).map((p) => `- [${p.externalId}] ${p.name} (R${p.price})`).join('\n') || '(none)';
  return ['CATALOG (use these external IDs):', fmt(catalog.all)].join('\n');
}

interface ContentBlock {
  type: string;
  text?: string;
  source?: { type: string; media_type: string; data: string };
}

export async function extractMarketingPlan(input: {
  text?: string;
  pdfBase64?: string;
  catalog: Catalog;
  season?: string;
  marketingFocus?: string;
}): Promise<PlanningResult<PlanGeneration>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY is not set' };
  if (!input.text?.trim() && !input.pdfBase64) {
    return { ok: false, error: 'Nothing to extract — provide a document or pasted text' };
  }

  const context = [
    input.season ? `Season / campaign hint: ${input.season}` : null,
    input.marketingFocus ? `Marketing focus hint: ${input.marketingFocus}` : null,
    catalogBlock(input.catalog),
  ].filter(Boolean).join('\n');

  const content: ContentBlock[] = [];
  if (input.pdfBase64) {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 } });
    content.push({ type: 'text', text: `${context}\n\nExtract the uploaded PDF plan into the schema.` });
  } else {
    content.push({ type: 'text', text: `${context}\n\nUPLOADED PLAN:\n${input.text}` });
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        output_config: { format: { type: 'json_schema', schema: PLAN_JSON_SCHEMA } },
      }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `Anthropic ${res.status}: ${body.slice(0, 300)}` };

    const parsed = JSON.parse(body) as { stop_reason?: string; content?: { type: string; text?: string }[] };
    if (parsed.stop_reason === 'refusal') return { ok: false, error: 'Claude declined to extract this document' };
    if (parsed.stop_reason === 'max_tokens') return { ok: false, error: 'Document was too large to extract in one pass' };

    const jsonText = (parsed.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    if (!jsonText) return { ok: false, error: 'Empty response from Claude' };

    const valid = PlanGenerationSchema.safeParse(JSON.parse(jsonText));
    if (!valid.success) return { ok: false, error: `Extraction failed validation: ${valid.error.issues[0]?.message}` };
    return { ok: true, data: valid.data };
  } catch (err) {
    return { ok: false, error: `Plan extraction failed: ${(err as Error).message}` };
  }
}
