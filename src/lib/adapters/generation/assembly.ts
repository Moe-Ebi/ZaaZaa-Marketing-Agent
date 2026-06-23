// ============================================================================
// Video assembly (Shotstack). Combines images/clips + captions + music into a
// final per-platform MP4. Meters seconds of output video (Rule 5).
// ============================================================================
import { submitRender, waitForRender, type ShotstackTimeline } from './shotstack-client';
import { recordUsage, checkTierAllowance } from './usage';
import { PLATFORM_DIMENSIONS } from './types';
import type { GenerationResult, AssembledVideoOutput, Platform } from './types';

export interface AssemblyAsset {
  type: 'image' | 'video';
  src: string;
  lengthSeconds?: number; // per-asset duration (images default to 3s)
}

export interface AssemblyInput {
  platform: Platform;
  assets: AssemblyAsset[];
  captions?: string[]; // shown sequentially over the clips
  musicUrl?: string;
}

export async function assembleVideo(
  organizationId: number,
  input: AssemblyInput,
): Promise<GenerationResult<AssembledVideoOutput>> {
  if (input.assets.length === 0) {
    return { ok: false, error: 'assembleVideo needs at least one asset' };
  }
  await checkTierAllowance(organizationId, 'assembly');

  // Lay assets out sequentially on a track.
  let cursor = 0;
  const mediaClips = input.assets.map((a) => {
    const length = a.lengthSeconds ?? (a.type === 'image' ? 3 : 5);
    const clip = {
      asset: { type: a.type, src: a.src },
      start: cursor,
      length,
      effect: a.type === 'image' ? 'zoomIn' : undefined,
    };
    cursor += length;
    return clip;
  });
  const totalDuration = cursor;

  // Captions on a track above, evenly distributed across the timeline.
  const captionClips =
    input.captions?.map((text, i) => {
      const slot = totalDuration / input.captions!.length;
      return {
        asset: { type: 'title', text, style: 'minimal' },
        start: +(i * slot).toFixed(2),
        length: +slot.toFixed(2),
      };
    }) ?? [];

  const timeline: ShotstackTimeline = {
    background: '#000000',
    tracks: [
      ...(captionClips.length ? [{ clips: captionClips }] : []),
      { clips: mediaClips },
    ],
    ...(input.musicUrl ? { soundtrack: { src: input.musicUrl, effect: 'fadeOut' } } : {}),
  };

  const submitted = await submitRender(timeline, {
    format: 'mp4',
    size: PLATFORM_DIMENSIONS[input.platform],
  });
  if (!submitted.ok) return { ok: false, error: submitted.error };

  const done = await waitForRender(submitted.data.id);
  if (!done.ok) return { ok: false, error: done.error };

  await recordUsage(organizationId, 'assembly', totalDuration, `${input.platform} ${totalDuration}s`);

  return {
    ok: true,
    data: { url: done.data.url!, platform: input.platform, durationSeconds: totalDuration },
  };
}
