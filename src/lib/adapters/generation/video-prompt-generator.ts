// ============================================================================
// Video prompt generator (Claude) — cinematic prompts for Higgsfield video.
// ----------------------------------------------------------------------------
// Rule 1: the app never calls Anthropic directly. Produces a text-to-video prompt
// and an image-to-video motion prompt from product + hook + content type, using
// Claude structured outputs. If ANTHROPIC_API_KEY is absent (or the call fails),
// it falls back to a sensible local template so video generation is never blocked.
// ============================================================================
import { z } from 'zod';

const API_URL = process.env.ANTHROPIC_API_URL ?? 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8';

export const VideoPromptSchema = z.object({
  textToVideoPrompt: z.string(),
  imageToVideoMotionPrompt: z.string(),
});
export type VideoPrompts = z.infer<typeof VideoPromptSchema>;

export interface PromptInput {
  productName: string;
  hook: string;
  contentType: string; // review | lifestyle | showcase
  brandColors?: string[];
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    textToVideoPrompt: { type: 'string' },
    imageToVideoMotionPrompt: { type: 'string' },
  },
  required: ['textToVideoPrompt', 'imageToVideoMotionPrompt'],
} as const;

// Local fallback so lifestyle video works even without an Anthropic key.
function templatePrompts(input: PromptInput): VideoPrompts {
  const palette = input.brandColors?.length ? `, palette ${input.brandColors.join(' and ')}` : '';
  return {
    textToVideoPrompt:
      `Cinematic lifestyle shot featuring ${input.productName}. ${input.hook}. ` +
      `Natural lighting, shallow depth of field, smooth camera movement, premium ${input.contentType} vibe${palette}.`,
    imageToVideoMotionPrompt:
      `Subtle, premium motion: slow push-in and gentle parallax on ${input.productName}, ` +
      `soft light shifts, cinematic ${input.contentType} feel — keep the product crisp and centered.`,
  };
}

export async function generateLifestylePrompt(input: PromptInput): Promise<VideoPrompts> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return templatePrompts(input);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system:
          'You write cinematic AI-video prompts. Return concrete, vivid prompts (camera, lighting, motion, mood) ' +
          'for a product marketing clip. Keep each under 80 words.',
        messages: [{
          role: 'user',
          content: `Product: ${input.productName}\nHook: ${input.hook}\nContent type: ${input.contentType}` +
            (input.brandColors?.length ? `\nBrand colors: ${input.brandColors.join(', ')}` : ''),
        }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      }),
    });
    if (!res.ok) return templatePrompts(input);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const jsonText = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    const parsed = VideoPromptSchema.safeParse(JSON.parse(jsonText));
    return parsed.success ? parsed.data : templatePrompts(input);
  } catch {
    return templatePrompts(input);
  }
}
