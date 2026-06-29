'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { distillBrandVoice } from '@/lib/adapters/generation/brand-voice';
import { getBrandProfile, upsertBrandProfile } from '@/lib/brand';
import { BrandProfileSchema, type BrandProfile, EMPTY_VOICE_PROFILE } from '@/lib/brand/types';

export type BrandActionResult = { ok: boolean; message: string; profile?: BrandProfile; logoUrl?: string };

const BUCKET = 'generated';

function splitSamples(text: string): string[] {
  return text.split(/\n-{3,}\n|\n{2,}/).map((s) => s.trim()).filter(Boolean);
}

/** Distill the voice profile with OpenAI, MERGE into the existing profile
 *  (preserving logo, colours, typography, examples) and persist. */
export async function analyzeVoice(input: {
  pastContent: string;
  guidelines: string;
}): Promise<BrandActionResult> {
  const ctx = await requireTenantContext();
  const distilled = await distillBrandVoice(splitSamples(input.pastContent), input.guidelines);
  if (!distilled.ok) return { ok: false, message: distilled.error };

  const existing = await getBrandProfile(ctx.tenantId);
  const profile: BrandProfile = {
    brandName: existing?.brandName ?? null,
    brandColors: existing?.brandColors ?? [],
    logoUrl: existing?.logoUrl ?? null,
    typography: existing?.typography ?? null,
    targetAudience: existing?.targetAudience ?? null,
    doRules: existing?.doRules ?? [],
    dontRules: existing?.dontRules ?? [],
    exampleLikes: existing?.exampleLikes ?? [],
    exampleDislikes: existing?.exampleDislikes ?? [],
    voiceProfile: distilled.data,
  };
  try {
    await upsertBrandProfile(ctx.tenantId, profile);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath('/dashboard/brand');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Voice profile generated — review and save.', profile };
}

/** Persist the full brand profile (all sections). */
export async function saveBrand(profile: BrandProfile): Promise<BrandActionResult> {
  const ctx = await requireTenantContext();
  const parsed = BrandProfileSchema.safeParse({ ...profile, voiceProfile: profile.voiceProfile ?? EMPTY_VOICE_PROFILE });
  if (!parsed.success) return { ok: false, message: `Invalid: ${parsed.error.issues[0]?.message}` };
  try {
    await upsertBrandProfile(ctx.tenantId, parsed.data);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath('/dashboard/brand');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Brand saved.', profile: parsed.data };
}

/** Upload a logo to storage and save its URL on the brand profile. */
export async function uploadLogo(formData: FormData): Promise<BrandActionResult> {
  const ctx = await requireTenantContext();
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'No file selected' };
  if (!file.type.startsWith('image/')) return { ok: false, message: 'Logo must be an image' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, message: 'Logo must be under 5 MB' };

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `brand/${ctx.tenantId}/logo-${Date.now()}.${ext}`;
  const admin = createAdminClient();
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (upErr) return { ok: false, message: `Upload failed: ${upErr.message}` };
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    // Persist on the profile (merge — don't clobber other fields).
    const existing = await getBrandProfile(ctx.tenantId);
    const profile: BrandProfile = {
      brandName: existing?.brandName ?? null,
      brandColors: existing?.brandColors ?? [],
      logoUrl: pub.publicUrl,
      typography: existing?.typography ?? null,
      targetAudience: existing?.targetAudience ?? null,
      doRules: existing?.doRules ?? [],
      dontRules: existing?.dontRules ?? [],
      exampleLikes: existing?.exampleLikes ?? [],
      exampleDislikes: existing?.exampleDislikes ?? [],
      voiceProfile: existing?.voiceProfile ?? EMPTY_VOICE_PROFILE,
    };
    await upsertBrandProfile(ctx.tenantId, profile);
    revalidatePath('/dashboard/brand');
    return { ok: true, message: 'Logo uploaded.', logoUrl: pub.publicUrl };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
