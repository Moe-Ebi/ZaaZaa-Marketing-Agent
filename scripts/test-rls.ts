// ============================================================================
// RLS isolation test — proves CLAUDE.md Rule 2 holds at the database level.
// ----------------------------------------------------------------------------
// Builds two tenants (Zaazaa = #1 from seed, plus a throwaway "RLS Test Org")
// with one user each, signs in AS each user using the anon key (so queries run
// under RLS), and asserts that neither user can see the other tenant's
// organization, memberships, or users. Cleans up the throwaway tenant/user.
// Exits non-zero on any isolation failure.
// ============================================================================
import './load-env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const USER_A = { email: 'test@zaazaa.com', password: process.env.SEED_TEST_PASSWORD ?? 'zaazaa-test-1234!' };
const USER_B = { email: 'rls-test-b@example.com', password: 'rls-test-b-1234!' };

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}`);
  if (!ok) failures++;
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function main() {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  // --- Setup: tenant A (Zaazaa #1, user A) is from the seed. Build tenant B. ---
  const { data: orgA } = await admin.from('organizations').select('id').eq('slug', 'zaazaa').single();
  const orgAId = orgA!.id as number;

  let { data: orgB } = await admin.from('organizations').select('id').eq('slug', 'rls-test-b').maybeSingle();
  if (!orgB) {
    const { data } = await admin
      .from('organizations')
      .insert({ name: 'RLS Test Org', slug: 'rls-test-b', multi_tenant: true })
      .select('id')
      .single();
    orgB = data;
  }
  const orgBId = orgB!.id as number;

  // User B
  let userBId: string;
  const { data: createdB, error: createBErr } = await admin.auth.admin.createUser({
    email: USER_B.email,
    password: USER_B.password,
    email_confirm: true,
  });
  if (createBErr) {
    const { data: existing } = await admin.from('users').select('id').eq('email', USER_B.email).single();
    userBId = existing!.id as string;
  } else {
    userBId = createdB.user.id;
  }
  await admin
    .from('organization_members')
    .upsert({ organization_id: orgBId, user_id: userBId, role: 'owner' }, { onConflict: 'organization_id,user_id' });

  console.log(`Setup: tenant A = Zaazaa #${orgAId} (test@zaazaa.com), tenant B = RLS Test Org #${orgBId} (rls-test-b@example.com)\n`);

  // --- Run as user A ---
  console.log('As user A (Zaazaa owner):');
  const a = await signedInClient(USER_A.email, USER_A.password);
  const aOrgs = (await a.from('organizations').select('id')).data ?? [];
  check('sees own org (Zaazaa)', aOrgs.some((o) => o.id === orgAId));
  check('does NOT see tenant B org', !aOrgs.some((o) => o.id === orgBId));
  check('sees exactly 1 org', aOrgs.length === 1);

  const aMembers = (await a.from('organization_members').select('organization_id')).data ?? [];
  check('sees only own-tenant memberships', aMembers.every((m) => m.organization_id === orgAId));

  const aUsers = (await a.from('users').select('email')).data ?? [];
  check('sees own user row', aUsers.some((u) => u.email === USER_A.email));
  check('does NOT see user B', !aUsers.some((u) => u.email === USER_B.email));

  // --- Run as user B ---
  console.log('\nAs user B (RLS Test Org owner):');
  const b = await signedInClient(USER_B.email, USER_B.password);
  const bOrgs = (await b.from('organizations').select('id')).data ?? [];
  check('sees own org (RLS Test Org)', bOrgs.some((o) => o.id === orgBId));
  check('does NOT see tenant A org (Zaazaa)', !bOrgs.some((o) => o.id === orgAId));
  check('sees exactly 1 org', bOrgs.length === 1);

  const bUsers = (await b.from('users').select('email')).data ?? [];
  check('does NOT see user A', !bUsers.some((u) => u.email === USER_A.email));

  // --- Cleanup throwaway tenant B ---
  console.log('\nCleanup:');
  await admin.from('organizations').delete().eq('id', orgBId); // cascades membership
  await admin.auth.admin.deleteUser(userBId);
  console.log('  ✓ removed RLS Test Org and user B');

  console.log(`\n${failures === 0 ? '✓ ALL RLS CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ RLS test errored:\n', err.message);
  process.exit(1);
});
