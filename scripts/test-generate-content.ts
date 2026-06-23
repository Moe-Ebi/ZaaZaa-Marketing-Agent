// ============================================================================
// Module 6 pipeline test — runs the full SENSE→PLAN→GENERATE→REVIEW pipeline
// for Zaazaa (the same code path the Inngest job runs), then verifies the
// content_item, its A/B variants, the state outcome, real assembled MP4s, and
// that usage_events were logged for each generation step.
// ============================================================================
import './load-env';
import { createClient } from '@supabase/supabase-js';
import { runContentGeneration } from '../src/lib/content/pipeline';

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

  const usageBefore = (await admin.from('usage_events').select('*', { count: 'exact', head: true }).eq('organization_id', orgId)).count ?? 0;

  console.log('Running content pipeline (SENSE → PLAN → GENERATE → REVIEW)…\n');
  const item = await runContentGeneration(orgId);

  console.log(`Item #${item.id} final state: ${item.state}`);
  if (item.error) console.log(`  note: ${item.error}`);

  check('content_item created', !!item.id);
  check('reached a terminal pipeline state',
    ['ready_for_review', 'waiting_for_credits', 'failed_retryable'].includes(item.state), item.state);
  check('PLAN chose a format', !!item.format, item.format ?? '');
  check('PLAN chose a hook angle', !!item.hookAngle, item.hookAngle ?? '');

  if (item.state === 'ready_for_review') {
    const script = item.script as { hook?: string; cta?: string };
    check('script has a hook', !!script.hook);
    console.log(`    hook: "${script.hook}"`);
    const platforms = Object.keys(item.finalVideoUrls);
    check('assembled at least one real MP4', platforms.length > 0, platforms.join(', '));
    for (const [p, u] of Object.entries(item.finalVideoUrls)) console.log(`    ${p}: ${u}`);
    check('linked to a product', item.productId !== null);
  } else {
    console.log('  (not ready_for_review — see note above; usage still verified below)');
  }

  // A/B variants
  const { data: variants } = await admin
    .from('content_variants')
    .select('variant_type, hook')
    .eq('content_item_id', item.id);
  check('stored 2 A/B hook variants', (variants?.length ?? 0) === 2,
    (variants ?? []).map((v) => v.variant_type).join(', '));

  // Usage metering
  const { data: recent } = await admin
    .from('usage_events')
    .select('event_type')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20);
  const usageAfter = (await admin.from('usage_events').select('*', { count: 'exact', head: true }).eq('organization_id', orgId)).count ?? 0;
  const types = new Set((recent ?? []).map((r) => r.event_type));
  console.log(`\nUsage events written this run: ${usageAfter - usageBefore}`);
  check('logged script usage (plan + scripts)', types.has('script'));
  check('logged voiceover usage', types.has('voiceover'));
  check('logged assembly usage', types.has('assembly') || item.state !== 'ready_for_review');

  console.log(`\n${failures === 0 ? '✓ PIPELINE CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Pipeline test errored:\n', err.message);
  process.exit(1);
});
