// ============================================================================
// Tenant context — the enforcement point for CLAUDE.md Rule 2.
// ----------------------------------------------------------------------------
// Every server-side read of tenant data should go through here. It resolves the
// authenticated user, the organizations (tenants) they belong to, and the
// "active" tenant for the request. The returned Supabase client is cookie-bound
// and runs UNDER RLS, so the database is the final authority on isolation — this
// helper makes the active tenant_id explicit for adapters and queries that need
// to filter by it.
// ============================================================================
import 'server-only';
import { cookies } from 'next/headers';
import { createServerSupabase } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACTIVE_ORG_COOKIE = 'active_org';

export type MemberRole = 'owner' | 'admin' | 'member';

export interface Membership {
  organizationId: number;
  role: MemberRole;
}

export interface TenantContext {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  memberships: Membership[];
  /** The active tenant for this request (from cookie, else first membership). */
  tenantId: number;
}

/**
 * Resolve the current tenant context, or null if the request is unauthenticated
 * or the user belongs to no organization. Never throws on the unauth path.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Reads run under RLS: this only returns memberships the user can see.
  const { data: rows, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id);

  if (error || !rows || rows.length === 0) return null;

  const memberships: Membership[] = rows.map((r) => ({
    organizationId: r.organization_id as number,
    role: r.role as MemberRole,
  }));

  const tenantId = await resolveActiveTenant(memberships);

  return {
    supabase,
    userId: user.id,
    email: user.email ?? '',
    memberships,
    tenantId,
  };
}

/**
 * Like getTenantContext but throws if there is no authenticated tenant context.
 * Use in code paths that must not run without a tenant (queries, adapter calls).
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    throw new Error('No tenant context: request is unauthenticated or user has no organization.');
  }
  return ctx;
}

/** Convenience: the active tenant_id, or throws. */
export async function getActiveTenantId(): Promise<number> {
  const ctx = await requireTenantContext();
  return ctx.tenantId;
}

async function resolveActiveTenant(memberships: Membership[]): Promise<number> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (raw) {
    const requested = Number(raw);
    // Only honor the cookie if the user actually belongs to that org.
    if (memberships.some((m) => m.organizationId === requested)) {
      return requested;
    }
  }
  return memberships[0].organizationId;
}
