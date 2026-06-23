// Generation adapter (public interface) — the production core.
// ----------------------------------------------------------------------------
// Rule 1: the rest of the app calls only these functions and never the vendor
// SDKs/APIs directly. Each is implemented in its own module behind a swappable
// boundary, reads the brand profile where relevant (Module 4), and meters every
// billable call (Rule 5). Failures return typed errors for the orchestrator
// (Module 6) to retry.
//
//   generateScript / generateCaption → OpenAI (reads brand voice)
//   generateImage / generateVideo     → Higgsfield (Soul / image-to-video)
//   generateVoiceover                 → OpenAI TTS (ElevenLabs stub for premium)
//   assembleVideo                     → Shotstack (per-platform MP4)

export * from './types';
export { recordUsage, checkTierAllowance } from './usage';

export { generateScript, generateCaption } from './script';
export type { ScriptInput, ProductContext } from './script';

export { generateImage } from './image';
export type { ImageInput } from './image';

export { generateVideo } from './video';
export type { VideoInput } from './video';

export { generateVoiceover } from './voiceover';
export type { VoiceoverInput } from './voiceover';

export { assembleVideo } from './assembly';
export type { AssemblyInput, AssemblyAsset } from './assembly';
