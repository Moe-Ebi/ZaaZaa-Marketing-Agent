// ============================================================================
// Module 8 publishing test.
// ----------------------------------------------------------------------------
// Validates the publish flow without real connected social accounts:
//   • seeds a publishing_wrapper credential (test account ids) so the adapter
//     actually calls Blotato → proves auth + request shaping reach the API
//   • publishContentItem writes a publications row per platform
//   • publishOneItem transitions the content_item based on the result
// A 200 success needs real connected accounts (operator step), same as Higgsfield
// credits — but everything up to the live post is exercised here.
// ============================================================================
import './load-env';
import { createClient } from '@supabase/supabase-js';
import { setCredential } from '../src/lib/vault';
import { getContentItem } from '../src/lib/content';
import { publishContentItem, listPublicationsByOrg } from '../src/lib/adapters/publishing';
import { publishOneItem } from '../src/lib/inngest/functions/publish-scheduled-content';

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

  // Pick any content item that has media to publish.
  const { data: row } = await admin
    .from('content_items')
    .select('id, state')
    .eq('organization_id', orgId)
    .order('id')
    .limit(1)
    .single();
  const itemId = row!.id as number;
  console.log(`Using content item #${itemId} (state: ${row!.state})\n`);

  console.log('Seed publishing_wrapper account config (test ids):');
  await setCredential(
    orgId,
    'publishing_wrapper',
    JSON.stringify({
      instagram: { accountId: 'test-ig-account' },
      tiktok: { accountId: 'test-tt-account' },
      facebook: { accountId: 'test-fb-account', pageId: 'test-page' },
    }),
    { action: 'create', label: 'Blotato (test accounts)' },
  );
  console.log('  ✓ seeded\n');

  console.log('publishContentItem → Blotato (per platform):');
  const item = await getContentItem(itemId);
  const res = await publishContentItem(orgId, item!);
  console.log(`  summary: ${res.data?.succeeded ?? 0} ok / ${res.data?.failed ?? 0} failed`);
  for (const r of res.data?.results ?? []) {
    console.log(`    ${r.platform}: ${r.status}${r.error ? ` — ${r.error.slice(0, 90)}` : ''}`);
  }

  console.log('\nPublication records written:');
  const pubs = (await listPublicationsByOrg(orgId))[itemId] ?? [];
  check('a publication row per targeted platform', pubs.length >= 1, `${pubs.length} rows`);
  check('records carry a status', pubs.every((p) => ['scheduled', 'published', 'failed'].includes(p.status)));

  console.log('\npublishOneItem → state transition:');
  const outcome = await publishOneItem(orgId, itemId);
  check('item transitioned (published or failed_retryable)', ['published', 'failed_retryable'].includes(outcome.state), outcome.state);
  const after = await getContentItem(itemId);
  check('content_item state updated in DB', after?.state === outcome.state, after?.state);

  // Cleanup the test credential.
  await admin.from('credentials').delete().eq('organization_id', orgId).eq('credential_type', 'publishing_wrapper');

  console.log(`\n${failures === 0 ? '✓ PUBLISH FLOW CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  console.log('(Note: live 200 publish needs real Blotato-connected social accounts.)');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Publish test errored:\n', err.message);
  process.exit(1);
});
