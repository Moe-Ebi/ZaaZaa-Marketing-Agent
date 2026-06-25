// ============================================================================
// Lifestyle video (Higgsfield) — strategy router + metering.
// ----------------------------------------------------------------------------
// 'lifestyle'      → text-to-video (fresh cinematic clip)
// 'product_motion' → image-to-video (animate the product photo)
// Generates a cinematic prompt (Claude, with template fallback), submits the job,
// polls to completion, and meters 'video_generation_higgsfield' by duration.
// Returns a typed error so the pipeline can fall back to Shotstack.
// ============================================================================
import { generateLifestylePrompt } from './video-prompt-generator';
import {
  generateTextToVideo,
  generateImageToVideo,
  waitForVideo,
} from './higgsfield-video';
import { recordUsage, checkTierAllowance } from './usage';
import type { GenerationResult, VideoStrategy } from './types';

export interface LifestyleVideoInput {
  strategy: Exclude<VideoStrategy, 'carousel'>;
  productName: string;
  hook: string;
  contentType?: string; // review | lifestyle | showcase
  imageUrl?: string; // required for product_motion
  brandColors?: string[];
  durationSeconds?: number; // lifestyle 10-15, product_motion 5-10
  resolution?: string; // "720p" | "1080p"
}

export interface LifestyleVideoOutput {
  url: string;
  durationSeconds: number;
  strategy: VideoStrategy;
}

export async function generateLifestyleVideo(
  organizationId: number,
  input: LifestyleVideoInput,
): Promise<GenerationResult<LifestyleVideoOutput>> {
  if (input.strategy === 'product_motion' && !input.imageUrl) {
    return { ok: false, error: 'product_motion needs an imageUrl' };
  }
  await checkTierAllowance(organizationId, 'video');

  const duration = input.durationSeconds ?? (input.strategy === 'lifestyle' ? 12 : 8);
  const resolution = input.resolution ?? '720p';

  const prompts = await generateLifestylePrompt({
    productName: input.productName,
    hook: input.hook,
    contentType: input.contentType ?? input.strategy,
    brandColors: input.brandColors,
  });

  const job =
    input.strategy === 'lifestyle'
      ? await generateTextToVideo(prompts.textToVideoPrompt, duration, resolution)
      : await generateImageToVideo(input.imageUrl!, prompts.imageToVideoMotionPrompt, duration, resolution);

  if (!job.ok) return { ok: false, error: job.error };

  const done = await waitForVideo(job.data.generationId);
  if (!done.ok) return { ok: false, error: done.error };

  // Meter by output seconds at the chosen resolution.
  await recordUsage(
    organizationId,
    'video_generation_higgsfield',
    duration,
    `${input.strategy} ${duration}s ${resolution}`,
  );

  return { ok: true, data: { url: done.data.videoUrl, durationSeconds: duration, strategy: input.strategy } };
}
