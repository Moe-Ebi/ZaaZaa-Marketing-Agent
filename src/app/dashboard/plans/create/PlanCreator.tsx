'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generatePlan } from '@/lib/actions/planning-actions';
import type { BudgetTier } from '@/lib/adapters/planning/types';

const inputCls = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500';

export function PlanCreator() {
  const router = useRouter();
  const [season, setSeason] = useState('');
  const [focus, setFocus] = useState('');
  const [tier, setTier] = useState<BudgetTier>('medium');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; planId?: number } | null>(null);

  function onGenerate() {
    setMsg(null);
    startTransition(async () => {
      const res = await generatePlan(season, focus, tier);
      setMsg({ ok: res.ok, text: res.message, planId: res.planId });
    });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-zinc-400">Season / campaign</span>
            <input className={inputCls} value={season} onChange={(e) => setSeason(e.target.value)} placeholder="e.g. Winter 2026, Back-to-School" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-zinc-400">Budget tier</span>
            <select className={inputCls} value={tier} onChange={(e) => setTier(e.target.value as BudgetTier)}>
              <option value="small">Small (~1 post/week)</option>
              <option value="medium">Medium (~2 posts/week)</option>
              <option value="large">Large (~3 posts/week)</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-zinc-400">Marketing focus</span>
          <textarea className={inputCls} rows={3} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Drive winter boot sales, grow TikTok following, push new arrivals to young shoppers" />
        </label>
        <button
          onClick={onGenerate}
          disabled={pending}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {pending ? 'Generating with Claude…' : 'Generate plan'}
        </button>
        {msg && (
          <p className={`text-sm ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>
            {msg.text}{' '}
            {msg.ok && msg.planId && (
              <button onClick={() => router.push(`/dashboard/plans/${msg.planId}/view`)} className="text-indigo-400 underline">
                Review &amp; approve →
              </button>
            )}
          </p>
        )}
      </section>
      <p className="text-xs text-zinc-500">
        Claude reads your live product catalogue (bestsellers, new arrivals) and builds a 3-month plan. Review it,
        edit scripts inline, then approve — Month 1 generates immediately and later months roll out weekly.
      </p>
    </div>
  );
}
