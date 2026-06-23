'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/context';
import { setCredential, type CredentialType } from '@/lib/vault';

const CREDENTIAL_TYPES = [
  'woocommerce',
  'higgsfield',
  'shotstack',
  'openai',
  'publishing_wrapper',
] as const;

const inputSchema = z.object({
  credentialType: z.enum(CREDENTIAL_TYPES),
  value: z.string().trim().min(1, 'Value is required'),
  label: z.string().trim().optional(),
});

export type ActionState = { ok: boolean; message: string };

async function upsert(
  formData: FormData,
  action: 'create' | 'rotate',
): Promise<ActionState> {
  const parsed = inputSchema.safeParse({
    credentialType: formData.get('credentialType'),
    value: formData.get('value'),
    label: formData.get('label') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const ctx = await requireTenantContext();
  await setCredential(
    ctx.tenantId,
    parsed.data.credentialType as CredentialType,
    parsed.data.value,
    { actorUserId: ctx.userId, label: parsed.data.label ?? null, action },
  );

  revalidatePath('/admin/credentials');
  const verb = action === 'rotate' ? 'rotated' : 'saved';
  return { ok: true, message: `${parsed.data.credentialType} credential ${verb}` };
}

export async function addCredential(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return upsert(formData, 'create');
}

export async function rotateCredential(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return upsert(formData, 'rotate');
}
