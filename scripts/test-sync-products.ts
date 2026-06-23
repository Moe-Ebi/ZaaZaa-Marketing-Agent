// Runs the WooCommerce sync job's core directly (no Inngest runtime) for Zaazaa,
// then verifies products landed in the cache and that a re-sync updates (not
// duplicates) them. Mirrors what the daily cron / "Sync now" button trigger.
import './load-env';
import { createClient } from '@supabase/supabase-js';
import { syncProductsForOrg } from '../src/lib/inngest/functions/sync-woocommerce-products';

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

  console.log('First sync (cold):');
  const first = await syncProductsForOrg(orgId);
  check('sync succeeded', first.ok, first.error);
  check('synced at least one product', first.synced > 0, `${first.synced} products`);
  console.log(`  → synced ${first.synced}, ${first.created} new, ${first.updated} updated`);

  const { count } = await admin
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  check('products present in DB cache', (count ?? 0) > 0, `${count} rows`);

  // Sample a row.
  const { data: sample } = await admin
    .from('products')
    .select('title, price, stock_status, stock_level, total_sales, synced_at')
    .eq('organization_id', orgId)
    .limit(1)
    .single();
  if (sample) console.log(`  e.g. "${sample.title}" — R${sample.price} · ${sample.stock_status} · synced ${sample.synced_at}`);

  console.log('\nSecond sync (warm — should update, not duplicate):');
  const before = sample?.synced_at;
  const second = await syncProductsForOrg(orgId);
  check('re-sync succeeded', second.ok, second.error);
  check('no new rows on re-sync (all updated)', second.created === 0, `${second.created} new, ${second.updated} updated`);

  const { count: count2 } = await admin
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  check('product count is stable (no duplicates)', count === count2, `${count} → ${count2}`);

  const { data: sample2 } = await admin
    .from('products')
    .select('synced_at')
    .eq('organization_id', orgId)
    .eq('title', sample?.title ?? '')
    .limit(1)
    .single();
  check('synced_at refreshed on re-sync', !!sample2 && sample2.synced_at !== before);

  console.log(`\n${failures === 0 ? '✓ SYNC CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Sync test errored:\n', err.message);
  process.exit(1);
});
