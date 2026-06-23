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
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
      >
        {pending ? 'Queuing…' : 'Generate content'}
      </button>
      {state.message && (
        <span className={`text-sm ${state.ok ? 'text-green-400' : 'text-red-400'}`}>{state.message}</span>
      )}
    </form>
  );
}
