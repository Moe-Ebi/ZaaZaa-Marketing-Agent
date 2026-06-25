// ============================================================================
// Lifestyle reel assembly (Shotstack) — Module 11.
// ----------------------------------------------------------------------------
// Composes a finished per-platform reel from a lifestyle video: the video layer
// + text overlays (hook intro, CTA outro) + voiceover/music. Returns one MP4 per
// platform at the correct 9:16 dimensions. Caller handles the fallback to the
// product-photo Shotstack path if the lifestyle video wasn't produced.
// ============================================================================
import { submitRender, waitForRender, type ShotstackTimeline } from '@/lib/adapters/generation/shotstack-client';
import { recordUsage } from '@/lib/adapters/generation';
import { PLATFORM_DIMENSIONS, type Platform } from '@/lib/adapters/generation/types';

export interface LifestyleReelInput {
  videoUrl: string;
  durationSeconds: number;
  hook: string;
  cta?: string;
  voiceoverUrl?: string;
  platforms?: Platform[];
}

export interface LifestyleReelResult {
  ok: boolean;
  urls: Partial<Record<Platform, string>>;
  errors: string[];
}

// Per-platform max durations (all 9:16).
const MAX_DURATION: Record<Platform, number> = { instagram: 90, tiktok: 600, facebook: 90 };

export async function assembleLifestyleReel(
  organizationId: number,
  input: LifestyleReelInput,
): Promise<LifestyleReelResult> {
  const platforms = input.platforms?.length ? input.platforms : (['instagram', 'tiktok', 'facebook'] as Platform[]);
  const urls: Partial<Record<Platform, string>> = {};
  const errors: string[] = [];

  for (const platform of platforms) {
    const length = Math.min(input.durationSeconds, MAX_DURATION[platform]);
    const intro = Math.min(3, length);
    const outroStart = Math.max(0, length - 3);

    const titleClips: unknown[] = [
      { asset: { type: 'title', text: input.hook, style: 'minimal' }, start: 0, length: intro },
    ];
    if (input.cta) {
      titleClips.push({ asset: { type: 'title', text: input.cta, style: 'minimal' }, start: outroStart, length: length - outroStart });
    }

    const timeline: ShotstackTimeline = {
      background: '#000000',
      tracks: [
        { clips: titleClips },
        { clips: [{ asset: { type: 'video', src: input.videoUrl }, start: 0, length }] },
      ],
      ...(input.voiceoverUrl ? { soundtrack: { src: input.voiceoverUrl, effect: 'fadeOut' } } : {}),
    };

    const submitted = await submitRender(timeline, { format: 'mp4', size: PLATFORM_DIMENSIONS[platform] });
    if (!submitted.ok) { errors.push(`${platform}: ${submitted.error}`); continue; }
    const done = await waitForRender(submitted.data.id);
    if (!done.ok) { errors.push(`${platform}: ${done.error}`); continue; }
    urls[platform] = done.data.url!;
    await recordUsage(organizationId, 'assembly', length, `lifestyle ${platform} ${length}s`);
  }

  return { ok: Object.keys(urls).length > 0, urls, errors };
}
