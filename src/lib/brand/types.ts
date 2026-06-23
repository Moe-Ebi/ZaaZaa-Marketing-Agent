import { z } from 'zod';

// The structured brand voice — the source of truth every generation reads.
export const VoiceProfileSchema = z.object({
  tone: z.array(z.string()),                 // descriptors, e.g. ["playful", "confident"]
  values: z.array(z.string()),               // brand values
  personality: z.string(),                   // one-line personality summary
  content_themes: z.array(z.string()),       // recurring topics/angles
  audience_keywords: z.array(z.string()),    // words that resonate with the audience
  prohibition_keywords: z.array(z.string()), // words/claims to avoid
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

// A brand colour, stored either as a bare hex string or {name, hex}.
export const BrandColorSchema = z.union([
  z.string(),
  z.object({ name: z.string().optional(), hex: z.string() }),
]);
export type BrandColor = z.infer<typeof BrandColorSchema>;

export const BrandProfileSchema = z.object({
  brandName: z.string().nullable(),
  brandColors: z.array(BrandColorSchema),
  logoUrl: z.string().nullable(),
  targetAudience: z.string().nullable(),
  doRules: z.array(z.string()),
  dontRules: z.array(z.string()),
  voiceProfile: VoiceProfileSchema,
});
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export const EMPTY_VOICE_PROFILE: VoiceProfile = {
  tone: [],
  values: [],
  personality: '',
  content_themes: [],
  audience_keywords: [],
  prohibition_keywords: [],
};
