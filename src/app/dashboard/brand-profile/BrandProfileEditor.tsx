'use client';

import { useState, useTransition } from 'react';
import type { StoredBrandProfile } from '@/lib/brand';
import type { BrandProfile } from '@/lib/brand/types';
import { analyzeProfile, saveProfile } from './actions';

const csv = (a: string[]) => a.join(', ');
const fromCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const lines = (a: string[]) => a.join('\n');
const fromLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

interface Editable {
  brandName: string;
  brandColors: string;
  targetAudience: string;
  doRules: string;
  dontRules: string;
  personality: string;
  tone: string;
  values: string;
  contentThemes: string;
  audienceKeywords: string;
  prohibitionKeywords: string;
}

function toEditable(p: StoredBrandProfile | null): Editable {
  const v = p?.voiceProfile;
  return {
    brandName: p?.brandName ?? '',
    brandColors: csv((p?.brandColors ?? []).map((c) => (typeof c === 'string' ? c : c.hex))),
    targetAudience: p?.targetAudience ?? '',
    doRules: lines(p?.doRules ?? []),
    dontRules: lines(p?.dontRules ?? []),
    personality: v?.personality ?? '',
    tone: csv(v?.tone ?? []),
    values: csv(v?.values ?? []),
    contentThemes: csv(v?.content_themes ?? []),
    audienceKeywords: csv(v?.audience_keywords ?? []),
    prohibitionKeywords: csv(v?.prohibition_keywords ?? []),
  };
}

function toBrandProfile(e: Editable): BrandProfile {
  return {
    brandName: e.brandName.trim() || null,
    brandColors: fromCsv(e.brandColors),
    logoUrl: null,
    targetAudience: e.targetAudience.trim() || null,
    doRules: fromLines(e.doRules),
    dontRules: fromLines(e.dontRules),
    voiceProfile: {
      tone: fromCsv(e.tone),
      values: fromCsv(e.values),
      personality: e.personality.trim(),
      content_themes: fromCsv(e.contentThemes),
      audience_keywords: fromCsv(e.audienceKeywords),
      prohibition_keywords: fromCsv(e.prohibitionKeywords),
    },
  };
}

const inputCls =
  'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand/60';

export function BrandProfileEditor({ initialProfile }: { initialProfile: StoredBrandProfile | null }) {
  const [pastContent, setPastContent] = useState('');
  const [guidelines, setGuidelines] = useState('');
  const [edit, setEdit] = useState<Editable>(toEditable(initialProfile));
  const [hasProfile, setHasProfile] = useState(initialProfile !== null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof Editable>(key: K, value: string) {
    setEdit((e) => ({ ...e, [key]: value }));
  }

  function onAnalyze() {
    setMsg(null);
    startTransition(async () => {
      const res = await analyzeProfile({
        pastContent,
        guidelines,
        brandName: edit.brandName,
        targetAudience: edit.targetAudience,
        brandColors: edit.brandColors,
        doRules: '', // basics are edited + saved in section 2; analyze focuses on voice
        dontRules: '',
      });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok && res.profile) {
        // Merge AI voice into the editable form, keeping operator basics.
        setEdit((e) => ({
          ...e,
          personality: res.profile!.voiceProfile.personality,
          tone: csv(res.profile!.voiceProfile.tone),
          values: csv(res.profile!.voiceProfile.values),
          contentThemes: csv(res.profile!.voiceProfile.content_themes),
          audienceKeywords: csv(res.profile!.voiceProfile.audience_keywords),
          prohibitionKeywords: csv(res.profile!.voiceProfile.prohibition_keywords),
        }));
        setHasProfile(true);
      }
    });
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveProfile(toBrandProfile(edit));
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  return (
    <div className="space-y-8">
      {/* 1. Source material */}
      <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-medium">1. Source material</h2>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Brand name</span>
          <input className={inputCls} value={edit.brandName} onChange={(e) => set('brandName', e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Past content — 3–5 old posts/captions (separate with a blank line or ---)</span>
          <textarea className={`${inputCls} font-mono text-xs`} rows={6} value={pastContent} onChange={(e) => setPastContent(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Brand guidelines (tone, values, do/don&apos;t, audience…)</span>
          <textarea className={`${inputCls} font-mono text-xs`} rows={5} value={guidelines} onChange={(e) => setGuidelines(e.target.value)} />
        </label>
        <button
          onClick={onAnalyze}
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? 'Analyzing…' : 'Analyze & Generate Profile'}
        </button>
      </section>

      {/* 2. Editable profile */}
      {hasProfile && (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <h2 className="font-medium">2. Brand voice profile (editable)</h2>
          <p className="text-xs text-subtle">Comma-separate list fields. Tweak anything, then save.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Personality" value={edit.personality} onChange={(v) => set('personality', v)} />
            <Field label="Tone (descriptors)" value={edit.tone} onChange={(v) => set('tone', v)} />
            <Field label="Values" value={edit.values} onChange={(v) => set('values', v)} />
            <Field label="Content themes" value={edit.contentThemes} onChange={(v) => set('contentThemes', v)} />
            <Field label="Audience keywords" value={edit.audienceKeywords} onChange={(v) => set('audienceKeywords', v)} />
            <Field label="Prohibition keywords" value={edit.prohibitionKeywords} onChange={(v) => set('prohibitionKeywords', v)} />
            <Field label="Target audience" value={edit.targetAudience} onChange={(v) => set('targetAudience', v)} />
            <Field label="Brand colors (hex, comma-sep)" value={edit.brandColors} onChange={(v) => set('brandColors', v)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="text-muted">Do rules (one per line)</span>
              <textarea className={inputCls} rows={3} value={edit.doRules} onChange={(e) => set('doRules', e.target.value)} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted">Don&apos;t rules (one per line)</span>
              <textarea className={inputCls} rows={3} value={edit.dontRules} onChange={(e) => set('dontRules', e.target.value)} />
            </label>
          </div>

          <button
            onClick={onSave}
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-strong disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save Profile'}
          </button>
        </section>
      )}

      {msg && (
        <p className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
