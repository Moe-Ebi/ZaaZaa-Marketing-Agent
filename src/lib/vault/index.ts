// ============================================================================
// Vault — the ONLY gateway to per-tenant credentials.
// ----------------------------------------------------------------------------
// Adapters (Rule 1) and the admin UI call these functions; they never touch the
// credentials table or the encryption layer directly. Every read/write is:
//   - tenant-scoped by organization_id
//   - encrypted/decrypted with the server-side key (Rule 3)
//   - recorded in credential_audit_log (POPIA)
// Writes use the service-role admin client (trusted server code); decryption
// only ever happens server-side and decrypted values are never logged.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import {
  encryptCredential,
  decryptCredential,
  maskSecret,
} from '@/lib/encryption/credentials';

export type CredentialType =
  | 'woocommerce'
  | 'higgsfield'
  | 'shotstack'
  | 'openai'
  | 'publishing_wrapper';

export type AuditAction =
  | 'create'
  | 'read'
  | 'view'
  | 'update'
  | 'rotate'
  | 'refresh'
  | 'delete';

export interface CredentialMeta {
  id: number;
  organizationId: number;
  credentialType: CredentialType;
  label: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface MaskedCredential extends CredentialMeta {
  masked: string;
}

export interface AuditEntry {
  id: number;
  credentialType: CredentialType | null;
  action: AuditAction;
  userId: string | null;
  detail: string | null;
  createdAt: string;
}

interface WriteOpts {
  actorUserId?: string | null;
  label?: string | null;
}

async function audit(params: {
  organizationId: number;
  credentialId?: number | null;
  credentialType?: CredentialType | null;
  action: AuditAction;
  actorUserId?: string | null;
  detail?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from('credential_audit_log').insert({
    organization_id: params.organizationId,
    credential_id: params.credentialId ?? null,
    credential_type: params.credentialType ?? null,
    action: params.action,
    user_id: params.actorUserId ?? null,
    detail: params.detail ?? null,
  });
}

/**
 * Store a credential as the new active one for (org, type), archiving any
 * existing active credential of the same type. Used for both initial create and
 * rotation. The plaintext is encrypted before it ever leaves this process.
 */
export async function setCredential(
  organizationId: number,
  credentialType: CredentialType,
  plaintext: string,
  opts: WriteOpts & { action?: 'create' | 'rotate' | 'refresh' } = {},
): Promise<CredentialMeta> {
  const admin = createAdminClient();

  // Archive any current active credential of this type.
  const { data: existing } = await admin
    .from('credentials')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('credential_type', credentialType)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    await admin.from('credentials').update({ status: 'archived' }).eq('id', existing.id);
  }

  const action = opts.action ?? (existing ? 'rotate' : 'create');
  const encrypted_value = encryptCredential(plaintext);

  const { data, error } = await admin
    .from('credentials')
    .insert({
      organization_id: organizationId,
      credential_type: credentialType,
      label: opts.label ?? null,
      encrypted_value,
      status: 'active',
    })
    .select('id, organization_id, credential_type, label, status, created_at, updated_at')
    .single();

  if (error) throw new Error(`Failed to store credential: ${error.message}`);

  await audit({
    organizationId,
    credentialId: data.id,
    credentialType,
    action,
    actorUserId: opts.actorUserId,
    detail: existing ? `archived #${existing.id}` : null,
  });

  return toMeta(data);
}

/**
 * Fetch and decrypt the active credential for (org, type). Returns null if none.
 * Logs a 'read' audit entry. THIS is what adapters call.
 */
export async function getCredential(
  organizationId: number,
  credentialType: CredentialType,
  opts: { actorUserId?: string | null } = {},
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credentials')
    .select('id, encrypted_value')
    .eq('organization_id', organizationId)
    .eq('credential_type', credentialType)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw new Error(`Failed to read credential: ${error.message}`);
  if (!data) return null;

  await audit({
    organizationId,
    credentialId: data.id,
    credentialType,
    action: 'read',
    actorUserId: opts.actorUserId,
  });

  return decryptCredential(data.encrypted_value);
}

/** Convenience: decrypt and JSON.parse a credential stored as JSON. */
export async function getCredentialJSON<T>(
  organizationId: number,
  credentialType: CredentialType,
  opts: { actorUserId?: string | null } = {},
): Promise<T | null> {
  const raw = await getCredential(organizationId, credentialType, opts);
  return raw === null ? null : (JSON.parse(raw) as T);
}

/** List active credential metadata for a tenant (no decryption, no audit). */
export async function listCredentials(organizationId: number): Promise<CredentialMeta[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credentials')
    .select('id, organization_id, credential_type, label, status, created_at, updated_at')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('credential_type');
  if (error) throw new Error(`Failed to list credentials: ${error.message}`);
  return (data ?? []).map(toMeta);
}

/**
 * List active credentials with a masked preview (last 4 chars). Decrypts each,
 * so it logs a 'view' audit entry per credential. Used by the admin UI list.
 */
export async function listCredentialsMasked(
  organizationId: number,
  opts: { actorUserId?: string | null } = {},
): Promise<MaskedCredential[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credentials')
    .select('id, organization_id, credential_type, label, status, created_at, updated_at, encrypted_value')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('credential_type');
  if (error) throw new Error(`Failed to list credentials: ${error.message}`);

  const result: MaskedCredential[] = [];
  for (const row of data ?? []) {
    const masked = maskSecret(decryptCredential(row.encrypted_value));
    await audit({
      organizationId,
      credentialId: row.id,
      credentialType: row.credential_type,
      action: 'view',
      actorUserId: opts.actorUserId,
    });
    result.push({ ...toMeta(row), masked });
  }
  return result;
}

/** Recent audit-log entries for a tenant (most recent first). */
export async function listAuditLog(
  organizationId: number,
  limit = 50,
): Promise<AuditEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credential_audit_log')
    .select('id, credential_type, action, user_id, detail, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to read audit log: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    credentialType: r.credential_type,
    action: r.action,
    userId: r.user_id,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}

function toMeta(row: {
  id: number;
  organization_id: number;
  credential_type: CredentialType;
  label: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}): CredentialMeta {
  return {
    id: row.id,
    organizationId: row.organization_id,
    credentialType: row.credential_type,
    label: row.label,
    status: row.status as 'active' | 'archived',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
