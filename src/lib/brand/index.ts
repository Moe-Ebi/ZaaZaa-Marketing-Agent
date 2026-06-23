// ============================================================================
// Brand profile service — the read/write gateway for a tenant's brand identity.
// ----------------------------------------------------------------------------
// Downstream modules call getBrandProfile(orgId) to read the stored structured
// profile (never re-querying OpenAI). Writes are explicit and tenant-scoped.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import {
  type BrandProfile,
  type VoiceProfile,
  EMPTY_VOICE_PROFILE,
} from './types';

interface BrandProfileRow {
  brand_name: string | null;
  brand_colors: unknown;
  logo_url: string | null;
  target_audience: string | null;
  do_rules: unknown;
  dont_rules: unknown;
  voice_profile: unknown;
  updated_at: string;
}

export interface StoredBrandProfile extends BrandProfile {
  updatedAt: string;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

function rowToProfile(r: BrandProfileRow): StoredBrandProfile {
  const vp = (r.voice_profile ?? {}) as Partial<VoiceProfile>;
  return {
    brandName: r.brand_name,
    brandColors: Array.isArray(r.brand_colors) ? r.brand_colors : [],
    logoUrl: r.logo_url,
    targetAudience: r.target_audience,
    doRules: asStringArray(r.do_rules),
    dontRules: asStringArray(r.dont_rules),
    voiceProfile: {
      tone: asStringArray(vp.tone),
      values: asStringArray(vp.values),
      personality: vp.personality ?? '',
      content_themes: asStringArray(vp.content_themes),
      audience_keywords: asStringArray(vp.audience_keywords),
      prohibition_keywords: asStringArray(vp.prohibition_keywords),
    },
    updatedAt: r.updated_at,
  };
}

const SELECT =
  'brand_name, brand_colors, logo_url, target_audience, do_rules, dont_rules, voice_profile, updated_at';

/** The tenant's brand profile, or null if none has been created yet. */
export async function getBrandProfile(organizationId: number): Promise<StoredBrandProfile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('brand_profiles')
    .select(SELECT)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read brand profile: ${error.message}`);
  return data ? rowToProfile(data as BrandProfileRow) : null;
}

/** Create or update the tenant's brand profile (one row per tenant). */
export async function upsertBrandProfile(
  organizationId: number,
  profile: BrandProfile,
): Promise<StoredBrandProfile> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('brand_profiles')
    .upsert(
      {
        organization_id: organizationId,
        brand_name: profile.brandName,
        brand_colors: profile.brandColors,
        logo_url: profile.logoUrl,
        target_audience: profile.targetAudience,
        do_rules: profile.doRules,
        dont_rules: profile.dontRules,
        voice_profile: profile.voiceProfile,
      },
      { onConflict: 'organization_id' },
    )
    .select(SELECT)
    .single();
  if (error) throw new Error(`Failed to save brand profile: ${error.message}`);
  return rowToProfile(data as BrandProfileRow);
}

export { EMPTY_VOICE_PROFILE };
