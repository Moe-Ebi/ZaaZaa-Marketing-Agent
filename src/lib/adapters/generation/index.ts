// Generation adapter — wraps Higgsfield (via Segmind), OpenAI, Shotstack, ElevenLabs
// All generation calls go through these functions; callers never touch vendor SDKs directly.

export type GenerationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ScriptOutput {
  script: string;
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
}

export interface AssembledVideoOutput {
  url: string;
  format: 'reels' | 'tiktok' | 'story' | 'feed';
  durationSeconds: number;
}

// Stub implementations — will be replaced per-adapter in Module 5
export async function generateScript(
  _productId: string,
  _tenantId: string,
): Promise<GenerationResult<ScriptOutput>> {
  throw new Error('generateScript: not implemented — wire in Module 5');
}

export async function generateImage(
  _prompt: string,
  _tenantId: string,
): Promise<GenerationResult<ImageOutput>> {
  throw new Error('generateImage: not implemented — wire in Module 5');
}

export async function generateVideo(
  _prompt: string,
  _tenantId: string,
): Promise<GenerationResult<VideoOutput>> {
  throw new Error('generateVideo: not implemented — wire in Module 5');
}

export async function generateVoiceover(
  _text: string,
  _tenantId: string,
): Promise<GenerationResult<VoiceoverOutput>> {
  throw new Error('generateVoiceover: not implemented — wire in Module 5');
}

export async function assembleVideo(
  _clips: VideoOutput[],
  _tenantId: string,
): Promise<GenerationResult<AssembledVideoOutput>> {
  throw new Error('assembleVideo: not implemented — wire in Module 5');
}
