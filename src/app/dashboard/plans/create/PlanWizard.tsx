'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generatePlanFromWizard, type WizardAnswers } from '@/lib/actions/planning-actions';
import type { PlanPlatform } from '@/lib/adapters/planning/types';

const GOALS = ['Grow followers', 'Drive sales', 'Launch a product', 'Build brand awareness', 'Re-engage past customers'];
const AUDIENCES = ['Value-conscious families', 'Young trend-aware shoppers', 'Working professionals', 'Students', 'General SA market'];
const TONES = ['Warm & friendly', 'Playful & upbeat', 'Premium & confident', 'Bold & energetic', 'Minimal & clean'];
const CADENCES: { value: WizardAnswers['cadence']; label: string }[] = [
  { value: 'light', label: 'Light · ~1 post/week' },
  { value: 'medium', label: 'Medium · ~2 posts/week' },
  { value: 'heavy', label: 'Heavy · ~3 posts/week' },
];
const CONTENT_MIX = ['Mostly video', 'Balanced', 'Mostly static'];
const STRATEGIES: { value: WizardAnswers['videoStrategy']; label: string }[] = [
  { value: 'carousel', label: 'Simple carousel' },
  { value: 'lifestyle', label: 'Lifestyle video' },
  { value: 'product_motion', label: 'Product motion' },
];
const ALL_PLATFORMS: PlanPlatform[] = ['instagram', 'tiktok', 'facebook'];

const STEPS = ['Goal', 'Audience', 'Channels', 'Format', 'Review'];

export function PlanWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const [a, setA] = useState<WizardAnswers>({
    primaryGoal: '',
    season: '',
    keyDates: '',
    targetAudience: '',
    tone: '',
    platforms: ['instagram', 'tiktok', 'facebook'],
    cadence: 'medium',
    contentMix: 'Balanced',
    videoStrategy: 'carousel',
    featuredFocus: '',
  });
  const set = <K extends keyof WizardAnswers>(k: K, v: WizardAnswers[K]) => setA((p) => ({ ...p, [k]: v }));

  const needsFeatured = a.primaryGoal === 'Launch a product' || a.primaryGoal === 'Drive sales';

  const valid: Record<number, boolean> = {
    0: !!a.primaryGoal && a.season.trim().length > 0 && (!needsFeatured || !!a.featuredFocus?.trim()),
    1: true, // audience/tone optional but encouraged
    2: a.platforms.length > 0,
    3: true,
    4: true,
  };

  function togglePlatform(p: PlanPlatform) {
    set('platforms', a.platforms.includes(p) ? a.platforms.filter((x) => x !== p) : [...a.platforms, p]);
  }

  function generate() {
    setMsg(null);
    startTransition(async () => {
      const res = await generatePlanFromWizard(a);
      setMsg(res.message);
      if (res.ok && res.planId) router.push(`/dashboard/plans/${res.planId}/view`);
    });
  }

  return (
    <div className="card space-y-6 p-5">
      {/* progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
              i < step ? 'bg-brand text-brand-ink' : i === step ? 'border border-brand text-brand' : 'border border-line text-subtle'
            }`}>{i + 1}</div>
            <span className={`hidden text-xs sm:inline ${i === step ? 'text-ink' : 'text-subtle'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-line" />}
          </div>
        ))}
      </div>

      {/* steps */}
      {step === 0 && (
        <div className="space-y-4">
          <Select label="Primary goal" value={a.primaryGoal} onChange={(v) => set('primaryGoal', v)} options={GOALS} placeholder="Choose a goal" />
          <Text label="Season / campaign" value={a.season} onChange={(v) => set('season', v)} placeholder="e.g. Winter 2026, Back-to-School" />
          {needsFeatured && (
            <Text label="What should we feature?" value={a.featuredFocus ?? ''} onChange={(v) => set('featuredFocus', v)} placeholder="e.g. the new leather boot range" />
          )}
          <Text label="Key dates to plan around (optional)" value={a.keyDates ?? ''} onChange={(v) => set('keyDates', v)} placeholder="e.g. Heritage Day, Black Friday" />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Select label="Target audience" value={a.targetAudience ?? ''} onChange={(v) => set('targetAudience', v)} options={AUDIENCES} placeholder="Choose audience" />
          <Select label="Tone" value={a.tone ?? ''} onChange={(v) => set('tone', v)} options={TONES} placeholder="Choose a tone" />
          <p className="text-xs text-subtle">Tip: leave tone blank to inherit your saved brand voice.</p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <span className="label">Platforms to prioritise</span>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition ${
                    a.platforms.includes(p) ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-ink'
                  }`}
                >{p}</button>
              ))}
            </div>
          </div>
          <Choice label="Posting cadence" value={a.cadence} onChange={(v) => set('cadence', v as WizardAnswers['cadence'])} options={CADENCES} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Select label="Content mix" value={a.contentMix ?? ''} onChange={(v) => set('contentMix', v)} options={CONTENT_MIX} placeholder="Choose a mix" />
          <Choice label="Default video style" value={a.videoStrategy} onChange={(v) => set('videoStrategy', v as WizardAnswers['videoStrategy'])} options={STRATEGIES} />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">Review your brief</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Row k="Goal" v={a.primaryGoal} />
            <Row k="Season" v={a.season} />
            {a.featuredFocus && <Row k="Feature" v={a.featuredFocus} />}
            {a.keyDates && <Row k="Key dates" v={a.keyDates} />}
            <Row k="Audience" v={a.targetAudience || 'brand default'} />
            <Row k="Tone" v={a.tone || 'brand voice'} />
            <Row k="Platforms" v={a.platforms.join(', ')} />
            <Row k="Cadence" v={a.cadence} />
            <Row k="Content mix" v={a.contentMix || '—'} />
            <Row k="Video style" v={a.videoStrategy} />
          </dl>
        </div>
      )}

      {/* nav */}
      <div className="flex items-center justify-between border-t border-line pt-4">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending} className="btn-ghost btn-sm">
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-muted">{msg}</span>}
          {step < STEPS.length - 1 ? (
            <button onClick={() => valid[step] && setStep((s) => s + 1)} disabled={!valid[step]} className="btn-primary btn-sm">
              Next →
            </button>
          ) : (
            <button onClick={generate} disabled={pending} className="btn-primary">
              {pending ? 'Generating with Claude…' : 'Generate plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Text({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Select({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder ?? 'Choose…'}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="space-y-1">
      <span className="label">{label}</span>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
              value === o.value ? 'border-brand bg-brand/10 text-ink' : 'border-line text-muted hover:text-ink'
            }`}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-subtle">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}
