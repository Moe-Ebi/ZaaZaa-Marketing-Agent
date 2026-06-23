// ============================================================================
// Token-refresh job (scaffold) — daily Inngest cron.
// ----------------------------------------------------------------------------
// Social/publishing tokens expire: Meta ~60 days, TikTok 24h access / 365-day
// refresh. This job will, per tenant: read the encrypted credential from the
// vault, refresh it against the provider, re-encrypt and store the new value,
// and audit the action. For now the provider refresh is a STUB that logs and
// marks done — the vault round-trip + audit wiring is real so Module 8 just
// drops in the actual refresh calls.
//
// The core logic lives in plain exported helpers (testable without the Inngest
// runtime); the Inngest function below orchestrates them as durable steps.
// ============================================================================
import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCredential, setCredential, type CredentialType } from '@/lib/vault';

// Credential types that carry refreshable tokens. (Publishing wrapper today;
// add direct Meta/TikTok types here in Phase 2.)
export const REFRESHABLE: CredentialType[] = ['publishing_wrapper'];

export interface RefreshTarget {
  organizationId: number;
  credentialType: CredentialType;
}

/** Find every tenant with an active refreshable credential. */
export async function listRefreshTargets(): Promise<RefreshTarget[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credentials')
    .select('organization_id, credential_type')
    .in('credential_type', REFRESHABLE)
    .eq('status', 'active');
  if (error) throw new Error(`Failed to list refreshable credentials: ${error.message}`);
  return (data ?? []).map((r) => ({
    organizationId: r.organization_id as number,
    credentialType: r.credential_type as CredentialType,
  }));
}

/**
 * Refresh a single credential: read+decrypt (audited 'read'), refresh against
 * the provider (STUB), re-encrypt+store (audited 'refresh'). Returns whether it
 * was refreshed or skipped.
 */
export async function refreshOneCredential(
  target: RefreshTarget,
): Promise<{ refreshed: boolean }> {
  const { organizationId: orgId, credentialType: type } = target;

  const current = await getCredential(orgId, type);
  if (!current) return { refreshed: false };

  // STUB: call the provider's refresh endpoint here (Module 8). We keep the
  // same value for now to prove the round-trip without a real provider.
  console.log(`refreshing ${type} token for org ${orgId}`);
  const refreshedValue = current; // TODO(Module 8): real provider refresh

  await setCredential(orgId, type, refreshedValue, { action: 'refresh' });
  return { refreshed: true };
}

export const refreshCredentials = inngest.createFunction(
  { id: 'refresh-credentials', triggers: [{ cron: '0 3 * * *' }] }, // daily 03:00 UTC
  async ({ step }) => {
    const targets = await step.run('find-refreshable-credentials', listRefreshTargets);

    let refreshed = 0;
    for (const target of targets) {
      const res = await step.run(
        `refresh-${target.organizationId}-${target.credentialType}`,
        () => refreshOneCredential(target),
      );
      if (res.refreshed) refreshed++;
    }

    return { tenantsProcessed: targets.length, refreshed };
  },
);
