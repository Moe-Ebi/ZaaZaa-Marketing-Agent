// Image generation (Higgsfield Soul). Accepts a prompt + brand colors, submits
// an async job, polls to completion, returns the image URL. Meters 1 credit.
import { submitImageJob, getJobResult } from './higgsfield-client';
import { recordUsage, checkTierAllowance } from './usage';
import type { GenerationResult, ImageOutput } from './types';

export interface ImageInput {
  prompt: string;
  brandColors?: string[];
  size?: string; // e.g. "1536x1536"
  inputImageUrl?: string; // source photo for image-edit models (Nano Banana)
  aspectRatio?: string; // e.g. "9:16" for image-edit models
}

export async function generateImage(
  organizationId: number,
  input: ImageInput,
): Promise<GenerationResult<ImageOutput>> {
  await checkTierAllowance(organizationId, 'image');

  const colorHint =
    input.brandColors && input.brandColors.length
      ? ` Use a palette featuring ${input.brandColors.join(', ')}.`
      : '';
  const prompt = `${input.prompt}${colorHint}`;

  const submitted = await submitImageJob({
    prompt,
    width_and_height: input.size ?? '1536x1536',
    quality: '1080p',
    batch_size: 1,
    inputImageUrl: input.inputImageUrl,
    aspectRatio: input.aspectRatio,
  });
  if (!submitted.ok) return { ok: false, error: submitted.error };

  const result = await getJobResult(submitted.data.id);
  if (!result.ok) return { ok: false, error: result.error };

  const [w, h] = (input.size ?? '1536x1536').split('x').map(Number);
  await recordUsage(organizationId, 'image', 1, input.prompt.slice(0, 80));

  return { ok: true, data: { url: result.data.url!, width: w || 1536, height: h || 1536 } };
}
