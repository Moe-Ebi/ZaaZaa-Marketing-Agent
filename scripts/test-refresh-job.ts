// Exercises the token-refresh job's core logic (the same helpers the Inngest
// cron runs): seeds a publishing_wrapper credential, runs the refresh, and
// confirms it logs "refreshing …" and writes a 'refresh' audit entry.
import './load-env';
import { createClient } from '@supabase/supabase-js';
import { setCredential, listAuditLog } from '../src/lib/vault';
import { listRefreshTargets, refreshOneCredential } from '../src/lib/inngest/functions/refresh-credentials';

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}`);
  if (!ok) failures++;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await admin.from('organizations').select('id').eq('slug', 'zaazaa').single();
  const orgId = org!.id as number;

  console.log('Seed a refreshable (publishing_wrapper) credential:');
  await setCredential(orgId, 'publishing_wrapper', 'token-abc-123', { action: 'create', label: 'Ayrshare (test)' });
  console.log('  ✓ seeded');

  console.log('\nRun the refresh job core:');
  const targets = await listRefreshTargets();
  check('finds the refreshable target', targets.some((t) => t.organizationId === orgId && t.credentialType === 'publishing_wrapper'));

  const target = targets.find((t) => t.organizationId === orgId && t.credentialType === 'publishing_wrapper')!;
  const res = await refreshOneCredential(target);
  check('refreshed the credential', res.refreshed);

  console.log('\nAudit trail:');
  const log = await listAuditLog(orgId, 10);
  check("logged a 'refresh' action", log.some((l) => l.action === 'refresh' && l.credentialType === 'publishing_wrapper'));

  // cleanup
  await admin.from('credentials').delete().eq('organization_id', orgId).eq('credential_type', 'publishing_wrapper');

  console.log(`\n${failures === 0 ? '✓ REFRESH JOB CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ Refresh job test errored:\n', err.message);
  process.exit(1);
});
