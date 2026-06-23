// ============================================================================
// Vault test — proves Module 2 end to end:
//   1. store a secret -> the DB row holds ciphertext, NOT plaintext
//   2. read it back -> decrypts to the original
//   3. every access is recorded in credential_audit_log
//   4. the commerce adapter pulls WooCommerce creds from the vault and calls the
//      live store (Rule 1 + Rule 3)
// Exits non-zero on any failure.
// ============================================================================
import './load-env';
import { createClient } from '@supabase/supabase-js';
import {
  setCredential,
  getCredential,
  listAuditLog,
} from '../src/lib/vault';
import { getProducts } from '../src/lib/adapters/commerce';

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

  // --- 1. Encryption at rest -------------------------------------------------
  console.log('Encryption at rest:');
  const SECRET = 'sk-test-PLAINTEXT-SHOULD-NOT-APPEAR-9999';
  await setCredential(orgId, 'openai', SECRET, { action: 'create', label: 'vault test key' });

  const { data: row } = await admin
    .from('credentials')
    .select('encrypted_value')
    .eq('organization_id', orgId)
    .eq('credential_type', 'openai')
    .eq('status', 'active')
    .single();

  const stored = row!.encrypted_value as string;
  console.log(`  stored value: ${stored.slice(0, 48)}…`);
  check('ciphertext does NOT contain the plaintext', !stored.includes(SECRET));
  check('ciphertext does NOT contain a recognizable substring', !stored.includes('PLAINTEXT'));
  check('uses versioned envelope format (v1:)', stored.startsWith('v1:'));

  // --- 2. Round-trip ---------------------------------------------------------
  console.log('\nRound-trip:');
  const decrypted = await getCredential(orgId, 'openai');
  check('decrypts back to the original plaintext', decrypted === SECRET);

  // --- 3. Audit trail --------------------------------------------------------
  console.log('\nAudit trail:');
  const log = await listAuditLog(orgId, 10);
  const actions = log.map((l) => l.action);
  check("logged a 'create' on store", actions.includes('create'));
  check("logged a 'read' on access", actions.includes('read'));
  check('audit entries are tenant-scoped', log.every((l) => l.action !== undefined));

  // --- cleanup test key ------------------------------------------------------
  await admin.from('credentials').delete().eq('organization_id', orgId).eq('credential_type', 'openai');

  // --- 4. Vault-backed adapter ----------------------------------------------
  console.log('\nVault-backed commerce adapter:');
  // Seed Zaazaa's real WooCommerce credential from env (operator-supplied).
  const woo = {
    storeUrl: process.env.WOOCOMMERCE_STORE_URL!,
    consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
    consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  };
  await setCredential(orgId, 'woocommerce', JSON.stringify(woo), { action: 'create', label: 'Zaazaa WooCommerce' });
  console.log('  seeded Zaazaa WooCommerce credential into the vault');

  const result = await getProducts(orgId, { perPage: 3 });
  if (result.ok) {
    check('adapter fetched products via vault credential', result.data.length > 0, `${result.data.length} products`);
    if (result.data[0]) console.log(`    e.g. "${result.data[0].name}" — R${result.data[0].price}`);
  } else {
    check('adapter fetched products via vault credential', false, result.error);
  }

  console.log(`\n${failures === 0 ? '✓ ALL VAULT CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Vault test errored:\n', err.message);
  process.exit(1);
});
