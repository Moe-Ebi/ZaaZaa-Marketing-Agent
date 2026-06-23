'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Platform } from '@/lib/adapters/generation';
import { scheduleContent } from '../content-actions';

export function ScheduleControl({ contentId, platforms }: { contentId: number; platforms: Platform[] }) {
  const router = useRouter();
  const [when, setWhen] = useState('');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSchedule() {
    if (!when) {
      setMsg({ ok: false, text: 'Pick a date/time' });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await scheduleContent(contentId, when, platforms.length ? platforms : undefined);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) setTimeout(() => router.refresh(), 800);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-zinc-500"
      />
      <button
        disabled={pending}
        onClick={onSchedule}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {pending ? 'Scheduling…' : 'Schedule'}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</span>}
    </div>
  );
}
