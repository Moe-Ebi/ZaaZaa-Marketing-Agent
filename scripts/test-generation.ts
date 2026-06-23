// ============================================================================
// Module 5 generation adapter tests.
// ----------------------------------------------------------------------------
// Live coverage (stronger than mocks, since we have the keys):
//   • generateScript / generateCaption — real OpenAI, reads Zaazaa brand profile
//   • generateVoiceover — real OpenAI TTS, hosted in Supabase Storage
//   • assembleVideo — real Shotstack render of a REAL product image
//   • generateImage / generateVideo — real Higgsfield attempt (gated; reported,
//       not a hard failure if the vendor blocks the call)
// Confirms a usage_event is written for every successful billable call.
// ============================================================================
import './load-env';
import { createClient } from '@supabase/supabase-js';
import {
  generateScript,
  generateCaption,
  generateVoiceover,
  generateImage,
  generateVideo,
  assembleVideo,
} from '../src/lib/adapters/generation';

let failures = 0;
function check(label: string, ok: boolean, extra?: string) {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}
function note(label: string, ok: boolean, extra?: string) {
  console.log(`  ${ok ? '✓' : '⚠ skip'}  ${label}${extra ? ` — ${extra}` : ''}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await admin.from('organizations').select('id').eq('slug', 'zaazaa').single();
  const orgId = org!.id as number;

  const usageCount = async () => {
    const { count } = await admin
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    return count ?? 0;
  };
  const startUsage = await usageCount();

  // Real product from the WooCommerce cache (with an image for assembly).
  const { data: product } = await admin
    .from('products')
    .select('title, description, price, image_url')
    .eq('organization_id', orgId)
    .not('image_url', 'is', null)
    .limit(1)
    .single();
  const productCtx = {
    name: product!.title as string,
    description: (product!.description as string) ?? undefined,
    price: (product!.price as number) ?? undefined,
  };
  console.log(`Using product: "${productCtx.name}"\n`);

  // --- Script (OpenAI + brand profile) --------------------------------------
  console.log('generateScript (OpenAI, brand-aware):');
  const script = await generateScript(orgId, { product: productCtx, contentType: 'reel', angle: 'new arrival' });
  check('script generated', script.ok, script.ok ? undefined : script.error);
  if (script.ok) {
    check('has hook/body/cta/hashtags/content_type',
      !!script.data.hook && !!script.data.body && !!script.data.cta && Array.isArray(script.data.hashtags) && !!script.data.content_type);
    console.log(`    hook: "${script.data.hook}"`);
  }

  // --- Caption ---------------------------------------------------------------
  console.log('\ngenerateCaption (OpenAI, brand-aware):');
  const caption = await generateCaption(orgId, { product: productCtx, angle: 'bestseller' });
  check('caption generated', caption.ok, caption.ok ? undefined : caption.error);
  if (caption.ok) console.log(`    caption: "${caption.data.caption.slice(0, 80)}…"`);

  // --- Voiceover (OpenAI TTS → storage) -------------------------------------
  console.log('\ngenerateVoiceover (OpenAI TTS → Supabase Storage):');
  const vo = await generateVoiceover(orgId, { text: script.ok ? script.data.hook : 'Step into summer with Zaazaa.', tone: 'warm, upbeat' });
  check('voiceover generated + hosted', vo.ok, vo.ok ? vo.data.url : vo.error);

  // --- Assembly (Shotstack, real product image) -----------------------------
  console.log('\nassembleVideo (Shotstack, real product image):');
  const assembly = await assembleVideo(orgId, {
    platform: 'instagram',
    assets: [{ type: 'image', src: product!.image_url as string, lengthSeconds: 3 }],
    captions: script.ok ? [script.data.hook, script.data.cta] : ['Zaazaa'],
    musicUrl: vo.ok ? vo.data.url : undefined,
  });
  check('assembly rendered to MP4', assembly.ok, assembly.ok ? assembly.data.url : assembly.error);

  // --- Higgsfield image/video (gated; report, don't hard-fail) --------------
  console.log('\ngenerateImage (Higgsfield Soul — live attempt):');
  const image = await generateImage(orgId, { prompt: `Lifestyle product shot of ${productCtx.name}`, brandColors: ['#2b2b2b', '#d4a017'] });
  note('image generated', image.ok, image.ok ? image.data.url : image.error);

  console.log('\ngenerateVideo (Higgsfield image-to-video — live attempt):');
  const video = await generateVideo(orgId, { prompt: `Cinematic reveal of ${productCtx.name}`, durationSeconds: 5 });
  note('video generated', video.ok, video.ok ? video.data.url : video.error);

  // --- Usage metering --------------------------------------------------------
  console.log('\nUsage metering:');
  const endUsage = await usageCount();
  const written = endUsage - startUsage;
  console.log(`  usage_events written this run: ${written}`);
  const { data: recent } = await admin
    .from('usage_events')
    .select('event_type, tokens_or_credits_used, cost_estimate')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(written || 1);
  const types = new Set((recent ?? []).map((r) => r.event_type));
  check('usage_event logged for script', types.has('script'));
  check('usage_event logged for caption', types.has('caption'));
  check('usage_event logged for voiceover', types.has('voiceover') || !vo.ok);
  check('usage_event logged for assembly', types.has('assembly') || !assembly.ok);
  for (const r of recent ?? []) {
    console.log(`    ${r.event_type}: ${r.tokens_or_credits_used} units ≈ $${Number(r.cost_estimate).toFixed(4)}`);
  }

  console.log(`\n${failures === 0 ? '✓ GENERATION CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Generation test errored:\n', err.message);
  process.exit(1);
});
