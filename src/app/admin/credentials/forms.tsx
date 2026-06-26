'use client';

import { useActionState } from 'react';
import { addCredential, rotateCredential, type ActionState } from './actions';

const TYPES = ['woocommerce', 'higgsfield', 'shotstack', 'openai', 'publishing_wrapper'] as const;

const initial: ActionState = { ok: false, message: '' };

export function AddCredentialForm() {
  const [state, formAction, pending] = useActionState(addCredential, initial);
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-medium">Add / replace a credential</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Type</span>
          <select name="credentialType" className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm">
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Label (optional)</span>
          <input name="label" className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm" />
        </label>
      </div>
      <label className="space-y-1 text-sm block">
        <span className="text-muted">Value (the secret, or JSON for WooCommerce)</span>
        <textarea
          name="value"
          rows={3}
          required
          placeholder='e.g. sk-... or {"storeUrl":"https://...","consumerKey":"ck_...","consumerSecret":"cs_..."}'
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save credential'}
        </button>
        {state.message && (
          <span className={`text-sm ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</span>
        )}
      </div>
    </form>
  );
}

export function RotateForm({ credentialType }: { credentialType: string }) {
  const [state, formAction, pending] = useActionState(rotateCredential, initial);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="credentialType" value={credentialType} />
      <input
        name="value"
        required
        placeholder="new value"
        className="w-44 rounded border border-line bg-canvas px-2 py-1 font-mono text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-strong px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? '…' : 'Rotate'}
      </button>
      {state.message && (
        <span className={`text-xs ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</span>
      )}
    </form>
  );
}
