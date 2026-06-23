// ============================================================================
// Voiceover. Default: OpenAI TTS (cheap, fast). Premium: ElevenLabs (stub).
// ----------------------------------------------------------------------------
// OpenAI TTS returns raw audio bytes, so we host them in the 'generated' Supabase
// Storage bucket and return a public URL. Meters character count (Rule 5).
// ============================================================================
import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordUsage, checkTierAllowance } from './usage';
import type { GenerationResult, VoiceoverOutput } from './types';

const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
const BUCKET = 'generated';

export interface VoiceoverInput {
  text: string;
  tone?: string; // from brand profile, used to nudge voice choice
  voice?: string; // OpenAI voice id (alloy, verse, …)
  premium?: boolean; // route to ElevenLabs (not yet integrated)
}

export async function generateVoiceover(
  organizationId: number,
  input: VoiceoverInput,
): Promise<GenerationResult<VoiceoverOutput>> {
  if (!input.text.trim()) return { ok: false, error: 'generateVoiceover needs non-empty text' };

  if (input.premium) {
    // Premium tier — ElevenLabs brand voices arrive in a later phase.
    console.log('[voiceover] ElevenLabs not yet integrated — falling back to OpenAI TTS');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY is not set' };
  await checkTierAllowance(organizationId, 'voiceover');

  try {
    const openai = new OpenAI({ apiKey });
    const speech = await openai.audio.speech.create({
      model: TTS_MODEL,
      voice: input.voice ?? 'alloy',
      input: input.text,
      ...(input.tone ? { instructions: `Speak in a ${input.tone} tone.` } : {}),
    });
    const buffer = Buffer.from(await speech.arrayBuffer());

    const admin = createAdminClient();
    const path = `${organizationId}/voiceover/${Date.now()}.mp3`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'audio/mpeg', upsert: true });
    if (upErr) return { ok: false, error: `Failed to store audio: ${upErr.message}` };

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    const characters = input.text.length;
    // Rough spoken-duration estimate (~16 chars/sec) for display only.
    const durationSeconds = Math.max(1, Math.round(characters / 16));
    await recordUsage(organizationId, 'voiceover', characters, `${characters} chars`);

    return { ok: true, data: { url: pub.publicUrl, durationSeconds, characters } };
  } catch (err) {
    return { ok: false, error: `Voiceover generation failed: ${(err as Error).message}` };
  }
}
