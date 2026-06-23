// ============================================================================
// WooCommerce product sync — daily Inngest cron + on-demand event.
// ----------------------------------------------------------------------------
// Rule 4: this can take 30+s (paginated fetch of a whole catalogue), so it runs
// as a background job, never inline in a request. Fetches via the live client,
// upserts into the products cache, and reports a summary. Failures (missing key,
// network) are returned per-tenant and don't crash the run — Inngest retries.
// ============================================================================
import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllProducts } from '@/lib/adapters/commerce/woocommerce';

export interface SyncResult {
  organizationId: number;
  ok: boolean;
  synced: number;
  created: number;
  updated: number;
  error?: string;
}

/** Tenants that have an active WooCommerce credential in the vault. */
export async function listOrgsWithWooCommerce(): Promise<number[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credentials')
    .select('organization_id')
    .eq('credential_type', 'woocommerce')
    .eq('status', 'active');
  if (error) throw new Error(`Failed to list WooCommerce tenants: ${error.message}`);
  return (data ?? []).map((r) => r.organization_id as number);
}

/**
 * Sync one tenant's catalogue into the products cache. Never throws on a
 * WooCommerce/credential problem — returns a failed SyncResult so the caller
 * can log and move on (and Inngest can retry the step).
 */
export async function syncProductsForOrg(organizationId: number): Promise<SyncResult> {
  const fetched = await fetchAllProducts(organizationId);
  if (!fetched.ok) {
    console.warn(`[sync] org ${organizationId}: ${fetched.error} — skipping`);
    return { organizationId, ok: false, synced: 0, created: 0, updated: 0, error: fetched.error };
  }

  const admin = createAdminClient();

  // Which products already exist for this tenant (to count new vs updated).
  // PostgREST caps a read at 1000 rows, so page through to capture them all.
  const existing = new Set<number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: exErr } = await admin
      .from('products')
      .select('woocommerce_id')
      .eq('organization_id', organizationId)
      .range(from, from + PAGE - 1);
    if (exErr) {
      return { organizationId, ok: false, synced: 0, created: 0, updated: 0, error: exErr.message };
    }
    for (const r of page ?? []) existing.add(r.woocommerce_id as number);
    if (!page || page.length < PAGE) break;
  }

  const rows = fetched.data.map((p) => ({ organization_id: organizationId, ...p }));

  if (rows.length > 0) {
    const { error: upErr } = await admin
      .from('products')
      .upsert(rows, { onConflict: 'organization_id,woocommerce_id' });
    if (upErr) {
      return { organizationId, ok: false, synced: 0, created: 0, updated: 0, error: upErr.message };
    }
  }

  let created = 0;
  let updated = 0;
  for (const p of fetched.data) {
    if (existing.has(p.woocommerce_id)) updated++;
    else created++;
  }

  console.log(
    `[sync] org ${organizationId}: synced ${rows.length} products, ${created} new, ${updated} updated`,
  );
  return { organizationId, ok: true, synced: rows.length, created, updated };
}

export const syncWooCommerceProducts = inngest.createFunction(
  {
    id: 'sync-woocommerce-products',
    triggers: [
      { cron: '0 4 * * *' }, // daily 04:00 UTC
      { event: 'woocommerce/sync.requested' }, // on-demand ("Sync now")
    ],
  },
  async ({ event, step }) => {
    // On-demand event may target a single tenant; cron syncs all tenants.
    const requestedOrg = (event?.data as { organizationId?: number } | undefined)?.organizationId;
    const orgIds = requestedOrg
      ? [requestedOrg]
      : await step.run('list-woocommerce-tenants', listOrgsWithWooCommerce);

    const results: SyncResult[] = [];
    for (const orgId of orgIds) {
      const res = await step.run(`sync-org-${orgId}`, () => syncProductsForOrg(orgId));
      results.push(res);
    }

    const totals = results.reduce(
      (acc, r) => ({
        synced: acc.synced + r.synced,
        created: acc.created + r.created,
        updated: acc.updated + r.updated,
      }),
      { synced: 0, created: 0, updated: 0 },
    );

    return {
      tenants: orgIds.length,
      summary: `synced ${totals.synced} products, ${totals.created} new, ${totals.updated} updated`,
      results,
    };
  },
);
