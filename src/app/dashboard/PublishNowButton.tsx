'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { publishNow } from '@/lib/actions/publish-actions';

export function PublishNowButton({ contentId }: { contentId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const res = await publishNow(contentId);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) setTimeout(() => router.refresh(), 1500);
    });
  }

  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={onClick}
        className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
      >
        {pending ? 'Publishing…' : 'Publish now'}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</span>}
    </span>
  );
}
