'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generatePlan } from '@/lib/actions/planning-actions';
import type { BudgetTier } from '@/lib/adapters/planning/types';

const inputCls = 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand/60';

export function PlanCreator() {
  const router = useRouter();
  const [season, setSeason] = useState('');
  const [focus, setFocus] = useState('');
  const [tier, setTier] = useState<BudgetTier>('medium');
  const [videoStrategy, setVideoStrategy] = useState<'carousel' | 'lifestyle' | 'product_motion'>('carousel');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; planId?: number } | null>(null);

  function onGenerate() {
    setMsg(null);
    startTransition(async () => {
      const res = await generatePlan(season, focus, tier, videoStrategy);
      setMsg({ ok: res.ok, text: res.message, planId: res.planId });
    });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">Season / campaign</span>
            <input className={inputCls} value={season} onChange={(e) => setSeason(e.target.value)} placeholder="e.g. Winter 2026, Back-to-School" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Budget tier</span>
            <select className={inputCls} value={tier} onChange={(e) => setTier(e.target.value as BudgetTier)}>
              <option value="small">Small (~1 post/week)</option>
              <option value="medium">Medium (~2 posts/week)</option>
              <option value="large">Large (~3 posts/week)</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Video strategy</span>
            <select className={inputCls} value={videoStrategy} onChange={(e) => setVideoStrategy(e.target.value as typeof videoStrategy)}>
              <option value="carousel">Simple carousel (Shotstack)</option>
              <option value="lifestyle">Lifestyle video (Higgsfield text-to-video)</option>
              <option value="product_motion">Product motion (image-to-video)</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Marketing focus</span>
          <textarea className={inputCls} rows={3} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Drive winter boot sales, grow TikTok following, push new arrivals to young shoppers" />
        </label>
        <button
          onClick={onGenerate}
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? 'Generating with Claude…' : 'Generate plan'}
        </button>
        {msg && (
          <p className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>
            {msg.text}{' '}
            {msg.ok && msg.planId && (
              <button onClick={() => router.push(`/dashboard/plans/${msg.planId}/view`)} className="text-brand underline">
                Review &amp; approve →
              </button>
            )}
          </p>
        )}
      </section>
      <p className="text-xs text-subtle">
        Claude reads your live product catalogue (bestsellers, new arrivals) and builds a 3-month plan. Review it,
        edit scripts inline, then approve — Month 1 generates immediately and later months roll out weekly.
      </p>
    </div>
  );
}
