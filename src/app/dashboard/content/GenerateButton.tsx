'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { triggerGenerate, type GenerateActionState } from './actions';

const initial: GenerateActionState = { ok: false, message: '' };

export function GenerateButton() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(triggerGenerate, initial);

  return (
    <form
      action={async (fd) => {
        await formAction(fd);
        // Refresh shortly after so the new item (Generating → …) shows up.
        setTimeout(() => router.refresh(), 1500);
      }}
      className="flex items-center gap-3"
    >
      <select
        name="videoStrategy"
        defaultValue="carousel"
        className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand/60"
      >
        <option value="carousel">Simple carousel</option>
        <option value="lifestyle">Lifestyle video</option>
        <option value="product_motion">Product motion</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? 'Queuing…' : 'Generate content'}
      </button>
      {state.message && (
        <span className={`text-sm ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</span>
      )}
    </form>
  );
}
