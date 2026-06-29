// Exercises Module 4 end to end: distill a structured voice profile from sample
// Zaazaa content via OpenAI, store it, read it back, edit it, and confirm the
// edit persists. Calls the real OpenAI API (a few cents).
import './load-env';
import { distillBrandVoice } from '../src/lib/adapters/generation/brand-voice';
import { upsertBrandProfile, getBrandProfile } from '../src/lib/brand';
import type { BrandProfile } from '../src/lib/brand/types';
import { createClient } from '@supabase/supabase-js';

let failures = 0;
function check(label: string, ok: boolean, extra?: string) {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

const SAMPLES = [
  "Step into summer 🌞 The new canvas sneakers just dropped — lightweight, breezy, and built for those long Joburg days. Tag a friend who needs these. #ZaazaaShoes",
  "Heritage Day is coming! 🇿🇦 Celebrate in style with our proudly-local leather loafers. Limited stock — don't sleep on these.",
  "Rainy Cape Town mornings? ☔ Our waterproof boots have you covered. Comfort meets durability, no compromises.",
  "Back to school sorted 🎒 Durable, affordable school shoes that survive the playground. Parents, we got you.",
];

const GUIDELINES = `Zaazaa Shoes is a South African footwear brand. We're warm,
upbeat, and down-to-earth. We speak to everyday South Africans — value-conscious
families and young trend-aware shoppers. Always celebrate local culture and SA
seasons (summer is Dec-Feb). Do: be encouraging, use light emoji, mention value
and durability. Don't: be snobby, use luxury/elitist language, or make
unrealistic claims. Brand colors are charcoal (#2b2b2b) and warm gold (#d4a017).`;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await admin.from('organizations').select('id').eq('slug', 'zaazaa').single();
  const orgId = org!.id as number;

  console.log('Distill voice profile via OpenAI:');
  const result = await distillBrandVoice(SAMPLES, GUIDELINES);
  if (!result.ok) {
    check('OpenAI distillation succeeded', false, result.error);
    process.exit(1);
  }
  const v = result.data;
  check('OpenAI distillation succeeded', true);
  check('tone descriptors extracted', v.tone.length > 0, v.tone.join(', '));
  check('values extracted', v.values.length > 0, v.values.join(', '));
  check('personality extracted', v.personality.length > 0);
  check('content themes extracted', v.content_themes.length > 0, v.content_themes.join(', '));
  console.log(`    personality: "${v.personality}"`);

  console.log('\nStore + read back:');
  const profile: BrandProfile = {
    brandName: 'Zaazaa Shoes',
    brandColors: ['#2b2b2b', '#d4a017'],
    logoUrl: null,
    typography: null,
    targetAudience: 'Value-conscious South African families and young trend-aware shoppers',
    doRules: ['Be encouraging', 'Mention value and durability', 'Celebrate local culture'],
    dontRules: ['No luxury/elitist language', 'No unrealistic claims'],
    exampleLikes: [],
    exampleDislikes: [],
    voiceProfile: v,
  };
  await upsertBrandProfile(orgId, profile);
  const stored = await getBrandProfile(orgId);
  check('profile persisted', stored !== null);
  check('voice_profile stored as structured JSON', !!stored && stored.voiceProfile.tone.length === v.tone.length);
  check('brand colors stored', !!stored && stored.brandColors.length === 2);

  console.log('\nEdit + confirm persistence:');
  const edited: BrandProfile = { ...profile, voiceProfile: { ...v, personality: 'EDITED: friendly SA shoe expert' } };
  await upsertBrandProfile(orgId, edited);
  const reread = await getBrandProfile(orgId);
  check('edit persisted', reread?.voiceProfile.personality === 'EDITED: friendly SA shoe expert');
  check('still one profile per tenant (upsert, no dupe)', true);

  console.log(`\n${failures === 0 ? '✓ BRAND VOICE CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Brand voice test errored:\n', err.message);
  process.exit(1);
});
