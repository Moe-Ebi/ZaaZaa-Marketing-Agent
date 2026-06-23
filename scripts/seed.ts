// Seeds the first tenant: Zaazaa Shoes (organization #1, slug "zaazaa").
// Idempotent — safe to run repeatedly.
//
// Uses the service-role client (bypasses RLS) and the Auth admin API. Creating
// the auth user fires the on_auth_user_created trigger, which mirrors the row
// into public.users; the seed then attaches membership.
import './load-env';
import { createClient } from '@supabase/supabase-js';

const TEST_EMAIL = 'test@zaazaa.com';
const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD ?? 'zaazaa-test-1234!';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Organization (tenant #1) — idempotent by slug.
  let { data: org } = await admin
    .from('organizations')
    .select('id, name, slug, multi_tenant')
    .eq('slug', 'zaazaa')
    .maybeSingle();

  if (!org) {
    const { data, error } = await admin
      .from('organizations')
      .insert({ name: 'Zaazaa Shoes', slug: 'zaazaa', multi_tenant: false })
      .select('id, name, slug, multi_tenant')
      .single();
    if (error) throw new Error(`Failed to create organization: ${error.message}`);
    org = data;
    console.log(`✓ Created organization #${org.id} — ${org.name} (slug: ${org.slug})`);
  } else {
    console.log(`• Organization already exists: #${org.id} — ${org.name}`);
  }

  // 2. Test auth user — idempotent.
  let userId: string | undefined;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (createErr) {
    // Already exists — look it up via the mirrored public.users row.
    const { data: existing } = await admin
      .from('users')
      .select('id')
      .eq('email', TEST_EMAIL)
      .maybeSingle();
    userId = existing?.id;
    if (!userId) throw new Error(`Could not create or find test user: ${createErr.message}`);
    console.log(`• Test user already exists: ${TEST_EMAIL}`);
  } else {
    userId = created.user.id;
    console.log(`✓ Created test user: ${TEST_EMAIL} (password: ${TEST_PASSWORD})`);
  }

  // 3. Membership (owner) — idempotent by (org, user) unique constraint.
  const { error: memErr } = await admin
    .from('organization_members')
    .upsert(
      { organization_id: org.id, user_id: userId, role: 'owner' },
      { onConflict: 'organization_id,user_id' },
    );
  if (memErr) throw new Error(`Failed to create membership: ${memErr.message}`);
  console.log(`✓ ${TEST_EMAIL} is owner of ${org.name}`);

  console.log('\nSeed complete.');
}

main().catch((err) => {
  console.error('\n✗ Seed failed:\n', err.message);
  process.exit(1);
});
