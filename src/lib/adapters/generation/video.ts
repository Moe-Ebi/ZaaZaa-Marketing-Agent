// Video generation (Higgsfield image-to-video / DoP). Takes a product image or
// description (+ optional soundtrack), polls the async job, returns a video URL.
// Meters 1 credit, scaled by duration when known.
import { submitVideoJob, getJobResult } from './higgsfield-client';
import { generateVideoViaMcp, isMcpConfigured } from '@/lib/services/higgsfield-mcp-client';
import { recordUsage, checkTierAllowance } from './usage';
import type { GenerationResult, VideoOutput } from './types';

export interface VideoInput {
  prompt?: string;
  imageUrl?: string; // product image to animate
  durationSeconds?: number;
  soundtrack?: string;
}

export async function generateVideo(
  organizationId: number,
  input: VideoInput,
): Promise<GenerationResult<VideoOutput>> {
  if (!input.prompt && !input.imageUrl) {
    return { ok: false, error: 'generateVideo needs a prompt or an imageUrl' };
  }
  await checkTierAllowance(organizationId, 'video');

  const duration = input.durationSeconds ?? 5;

  // Prefer the Higgsfield MCP (Plus-plan quota) when configured; fall back to REST.
  if (isMcpConfigured()) {
    console.log('[generation] video via Higgsfield MCP');
    const mcpPrompt = input.prompt ?? 'Cinematic, premium product motion with smooth camera movement';
    const mcp = await generateVideoViaMcp(mcpPrompt, { durationSeconds: duration });
    if (mcp.ok && mcp.url) {
      const credits = Math.max(1, Math.round(duration / 5));
      await recordUsage(organizationId, 'video', credits, `mcp ${duration}s`);
      return { ok: true, data: { url: mcp.url, durationSeconds: duration } };
    }
    console.warn(`[generation] MCP video failed (${mcp.error}); falling back to REST`);
  } else {
    console.log('[generation] video via Higgsfield REST (MCP not configured)');
  }

  const submitted = await submitVideoJob({
    prompt: input.prompt,
    input_images: input.imageUrl ? [input.imageUrl] : undefined,
    duration,
    soundtrack: input.soundtrack,
  });
  if (!submitted.ok) return { ok: false, error: submitted.error };

  const result = await getJobResult(submitted.data.id, { timeoutMs: 300_000 });
  if (!result.ok) return { ok: false, error: result.error };

  // 1 credit per video, scaled by 5s units of duration.
  const credits = Math.max(1, Math.round(duration / 5));
  await recordUsage(organizationId, 'video', credits, `${duration}s`);

  return { ok: true, data: { url: result.data.url!, durationSeconds: duration } };
}
