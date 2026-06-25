// Shared types for the generation adapter. Kept in their own module so the
// per-service files and the index barrel can both import them without cycles.

export type GenerationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type GenerationEventType =
  | 'script'
  | 'caption'
  | 'image'
  | 'video'
  | 'voiceover'
  | 'assembly'
  | 'analytics_pull'
  | 'video_generation_higgsfield';

// How a content item's visual is produced.
export type VideoStrategy = 'carousel' | 'lifestyle' | 'product_motion';

export type Platform = 'instagram' | 'tiktok' | 'facebook';

// Structured script — what generateScript returns.
export interface ScriptOutput {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  content_type: string; // e.g. "reel", "story", "carousel caption"
}

export interface CaptionOutput {
  caption: string;
  hashtags: string[];
}

export interface ImageOutput {
  url: string;
  width: number;
  height: number;
}

export interface VideoOutput {
  url: string;
  durationSeconds: number;
}

export interface VoiceoverOutput {
  url: string;
  durationSeconds: number;
  characters: number;
}

export interface AssembledVideoOutput {
  url: string;
  platform: Platform;
  durationSeconds: number;
}

// Per-platform output dimensions for assembly.
export const PLATFORM_DIMENSIONS: Record<Platform, { width: number; height: number }> = {
  instagram: { width: 1080, height: 1920 }, // Reels 9:16
  tiktok: { width: 1080, height: 1920 }, // 9:16
  facebook: { width: 1080, height: 1350 }, // 4:5 feed
};
