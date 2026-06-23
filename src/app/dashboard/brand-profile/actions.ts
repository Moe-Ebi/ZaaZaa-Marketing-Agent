'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/context';
import { distillBrandVoice } from '@/lib/adapters/generation/brand-voice';
import { upsertBrandProfile } from '@/lib/brand';
import { BrandProfileSchema, type BrandProfile } from '@/lib/brand/types';

export type AnalyzeInput = {
  pastContent: string;
  guidelines: string;
  brandName: string;
  targetAudience: string;
  brandColors: string; // comma-separated hex values
  doRules: string; // newline-separated
  dontRules: string; // newline-separated
};

export type ProfileActionResult = {
  ok: boolean;
  message: string;
  profile?: BrandProfile;
};

function splitSamples(text: string): string[] {
  return text
    .split(/\n-{3,}\n|\n{2,}/) // "---" separators or blank lines
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitLines(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Run OpenAI distillation, then store the resulting profile and return it. */
export async function analyzeProfile(input: AnalyzeInput): Promise<ProfileActionResult> {
  const ctx = await requireTenantContext();

  const samples = splitSamples(input.pastContent);
  const distilled = await distillBrandVoice(samples, input.guidelines);
  if (!distilled.ok) {
    return { ok: false, message: distilled.error };
  }

  const profile: BrandProfile = {
    brandName: input.brandName.trim() || null,
    brandColors: splitLines(input.brandColors),
    logoUrl: null,
    targetAudience: input.targetAudience.trim() || null,
    doRules: input.doRules.split('\n').map((s) => s.trim()).filter(Boolean),
    dontRules: input.dontRules.split('\n').map((s) => s.trim()).filter(Boolean),
    voiceProfile: distilled.data,
  };

  try {
    await upsertBrandProfile(ctx.tenantId, profile);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }

  revalidatePath('/dashboard/brand-profile');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Profile generated — review and edit below, then save.', profile };
}

/** Persist operator edits to the profile. */
export async function saveProfile(profile: BrandProfile): Promise<ProfileActionResult> {
  const ctx = await requireTenantContext();

  const parsed = BrandProfileSchema.safeParse(profile);
  if (!parsed.success) {
    return { ok: false, message: `Invalid profile: ${parsed.error.issues[0]?.message}` };
  }

  try {
    await upsertBrandProfile(ctx.tenantId, parsed.data);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }

  revalidatePath('/dashboard/brand-profile');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Profile saved.', profile: parsed.data };
}
