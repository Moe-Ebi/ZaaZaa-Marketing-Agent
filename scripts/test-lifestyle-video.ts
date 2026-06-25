// ============================================================================
// Module 11 lifestyle-video test.
// ----------------------------------------------------------------------------
// Validates the lifestyle-video stack with graceful fallbacks (live Higgsfield
// video needs account credits — that path returns a typed error and the pipeline
// falls back to Shotstack):
//   • video prompt generation (Claude → template fallback)
//   • Higgsfield text-to-video / image-to-video → typed error (no credits)
//   • assembleLifestyleReel → real Shotstack reel from a sample video
//   • metering: 'video_generation_higgsfield' usage event
//   • pipeline: planned 'lifestyle' generation falls back to Shotstack and still
//     produces a ready_for_review item with per-platform MP4s
// ============================================================================
import './load-env';
import { createClient } from '@supabase/supabase-js';
import { generateLifestylePrompt } from '../src/lib/adapters/generation/video-prompt-generator';
import { generateTextToVideo } from '../src/lib/adapters/generation/higgsfield-video';
import { generateLifestyleVideo, recordUsage } from '../src/lib/adapters/generation';
import { assembleLifestyleReel } from '../src/lib/services/video-assembly';
import { runPlannedGeneration } from '../src/lib/content/pipeline';

const SAMPLE_VIDEO = 'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/footage/skater.hd.mp4';

let failures = 0;
function check(label: string, ok: boolean, extra?: string) {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await admin.from('organizations').select('id').eq('slug', 'zaazaa').single();
  const orgId = org!.id as number;
  const { data: product } = await admin
    .from('products')
    .select('woocommerce_id, title')
    .eq('organization_id', orgId)
    .not('image_url', 'is', null)
    .limit(1)
    .single();

  // --- 1. Prompt generation (template fallback w/o ANTHROPIC key) ---
  console.log('Video prompt generation:');
  const prompts = await generateLifestylePrompt({ productName: product!.title as string, hook: 'Step into summer', contentType: 'lifestyle', brandColors: ['#2b2b2b'] });
  check('text-to-video prompt produced', prompts.textToVideoPrompt.length > 20);
  check('image-to-video motion prompt produced', prompts.imageToVideoMotionPrompt.length > 20);
  console.log(`    t2v: "${prompts.textToVideoPrompt.slice(0, 70)}…"`);

  // --- 2. Higgsfield video (typed error, gated by credits) ---
  console.log('\nHiggsfield text-to-video (live attempt):');
  const t2v = await generateTextToVideo(prompts.textToVideoPrompt, 10, '720p');
  check('returns typed result, no throw', typeof t2v.ok === 'boolean', t2v.ok ? 'submitted' : `${t2v.kind}: ${t2v.error?.slice(0, 60)}`);

  console.log('\ngenerateLifestyleVideo (live attempt):');
  const lv = await generateLifestyleVideo(orgId, { strategy: 'lifestyle', productName: product!.title as string, hook: 'Step into summer' });
  check('graceful typed error or success', typeof lv.ok === 'boolean', lv.ok ? lv.data.url : lv.error.slice(0, 70));

  // --- 3. Reel assembly (real Shotstack from a sample video) ---
  console.log('\nassembleLifestyleReel (real Shotstack):');
  const reel = await assembleLifestyleReel(orgId, {
    videoUrl: SAMPLE_VIDEO, durationSeconds: 6, hook: 'Step into summer', cta: 'Shop now',
    platforms: ['instagram'],
  });
  check('assembled at least one platform reel', reel.ok, reel.ok ? reel.urls.instagram : reel.errors.join('; '));

  // --- 4. Metering ---
  console.log('\nMetering:');
  await recordUsage(orgId, 'video_generation_higgsfield', 12, 'test 12s 720p');
  const { data: usage } = await admin
    .from('usage_events').select('event_type, cost_estimate')
    .eq('organization_id', orgId).eq('event_type', 'video_generation_higgsfield')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  check("'video_generation_higgsfield' usage event recorded", !!usage, usage ? `$${Number(usage.cost_estimate).toFixed(2)}` : 'none');
  await admin.from('usage_events').delete().eq('organization_id', orgId).eq('event_type', 'video_generation_higgsfield');

  // --- 5. Pipeline: planned lifestyle falls back to Shotstack ---
  console.log('\nPlanned lifestyle generation (falls back to Shotstack):');
  const item = await runPlannedGeneration(orgId, {
    productExternalId: String(product!.woocommerce_id),
    format: 'reel',
    hook: 'Step into summer with Zaazaa',
    fullScript: 'Light, comfy, ready for SA summers.',
    platforms: ['instagram'],
    videoStrategy: 'lifestyle',
  });
  check('produced a ready_for_review item', item.state === 'ready_for_review', item.state);
  check('has per-platform MP4(s)', Object.keys(item.finalVideoUrls).length > 0, Object.keys(item.finalVideoUrls).join(', '));
  if (item.error) console.log(`    note: ${item.error}`);
  await admin.from('content_items').delete().eq('id', item.id);

  console.log(`\n${failures === 0 ? '✓ LIFESTYLE VIDEO CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  console.log('(Note: live Higgsfield video needs account credits; pipeline falls back to Shotstack until then.)');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Lifestyle video test errored:\n', err.message);
  process.exit(1);
});
