'use client';

import { useState, useTransition, useRef } from 'react';
import type { StoredBrandProfile } from '@/lib/brand';
import type { BrandProfile } from '@/lib/brand/types';
import { Card, SectionTitle } from '@/components/ui';
import { analyzeVoice, saveBrand, uploadLogo } from './actions';

const csv = (a: string[]) => a.join(', ');
const fromCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const fromLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const hexOf = (c: string | { hex: string }) => (typeof c === 'string' ? c : c.hex);

export function BrandSettings({ initial }: { initial: StoredBrandProfile | null }) {
  const v = initial?.voiceProfile;
  const [brandName, setBrandName] = useState(initial?.brandName ?? '');
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? '');
  const [typography, setTypography] = useState(initial?.typography ?? '');
  const [colors, setColors] = useState<string[]>((initial?.brandColors ?? []).map(hexOf));
  const [targetAudience, setTargetAudience] = useState(initial?.targetAudience ?? '');

  const [personality, setPersonality] = useState(v?.personality ?? '');
  const [tone, setTone] = useState(csv(v?.tone ?? []));
  const [values, setValues] = useState(csv(v?.values ?? []));
  const [themes, setThemes] = useState(csv(v?.content_themes ?? []));
  const [audienceKw, setAudienceKw] = useState(csv(v?.audience_keywords ?? []));
  const [prohibitionKw, setProhibitionKw] = useState(csv(v?.prohibition_keywords ?? []));

  const [doRules, setDoRules] = useState((initial?.doRules ?? []).join('\n'));
  const [dontRules, setDontRules] = useState((initial?.dontRules ?? []).join('\n'));
  const [likes, setLikes] = useState((initial?.exampleLikes ?? []).join('\n'));
  const [dislikes, setDislikes] = useState((initial?.exampleDislikes ?? []).join('\n'));

  const [pastContent, setPastContent] = useState('');
  const [guidelines, setGuidelines] = useState('');

  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function buildProfile(): BrandProfile {
    return {
      brandName: brandName.trim() || null,
      brandColors: colors,
      logoUrl: logoUrl || null,
      typography: typography.trim() || null,
      targetAudience: targetAudience.trim() || null,
      doRules: fromLines(doRules),
      dontRules: fromLines(dontRules),
      exampleLikes: fromLines(likes),
      exampleDislikes: fromLines(dislikes),
      voiceProfile: {
        tone: fromCsv(tone),
        values: fromCsv(values),
        personality: personality.trim(),
        content_themes: fromCsv(themes),
        audience_keywords: fromCsv(audienceKw),
        prohibition_keywords: fromCsv(prohibitionKw),
      },
    };
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveBrand(buildProfile());
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  function onAnalyze() {
    setMsg(null);
    startTransition(async () => {
      const res = await analyzeVoice({ pastContent, guidelines });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok && res.profile) {
        const vp = res.profile.voiceProfile;
        setPersonality(vp.personality);
        setTone(csv(vp.tone));
        setValues(csv(vp.values));
        setThemes(csv(vp.content_themes));
        setAudienceKw(csv(vp.audience_keywords));
        setProhibitionKw(csv(vp.prohibition_keywords));
      }
    });
  }

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    setMsg(null);
    startTransition(async () => {
      const res = await uploadLogo(fd);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok && res.logoUrl) setLogoUrl(res.logoUrl);
    });
  }

  return (
    <div className="space-y-6 pb-24">
      {/* 1. Identity */}
      <Card className="space-y-5">
        <SectionTitle>Identity</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <div className="space-y-2">
            <span className="label">Logo</span>
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Brand logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-subtle">No logo</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onLogoChange} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={pending} className="btn-ghost btn-sm w-28">
              Upload
            </button>
          </div>
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="label">Brand name</span>
              <input className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Zaazaa Shoes" />
            </label>
            <label className="block space-y-1">
              <span className="label">Typography preference</span>
              <input className="input" value={typography} onChange={(e) => setTypography(e.target.value)} placeholder="e.g. Bold geometric sans for headers, clean serif for body" />
            </label>
            <div className="space-y-2">
              <span className="label">Brand colours</span>
              <div className="flex flex-wrap items-center gap-2">
                {colors.map((c, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-1 pr-2">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#000000'}
                      onChange={(e) => setColors((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))}
                      className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <input
                      value={c}
                      onChange={(e) => setColors((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))}
                      className="w-20 bg-transparent font-mono text-xs text-ink outline-none"
                    />
                    <button onClick={() => setColors((cs) => cs.filter((_, j) => j !== i))} className="text-subtle hover:text-danger">×</button>
                  </span>
                ))}
                <button onClick={() => setColors((cs) => [...cs, '#e6b24c'])} className="btn-ghost btn-sm">+ Add</button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Voice */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Brand voice</SectionTitle>
          <span className="text-xs text-subtle">Comma-separate list fields</span>
        </div>

        <details className="rounded-lg border border-line bg-canvas p-3">
          <summary className="cursor-pointer text-sm text-muted">✨ Generate voice from examples (AI)</summary>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="label">Past content — 3–5 old posts/captions (blank line or --- between)</span>
              <textarea className="input font-mono text-xs" rows={5} value={pastContent} onChange={(e) => setPastContent(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="label">Written guidelines (tone, values, do/don&apos;t…)</span>
              <textarea className="input font-mono text-xs" rows={4} value={guidelines} onChange={(e) => setGuidelines(e.target.value)} />
            </label>
            <button onClick={onAnalyze} disabled={pending} className="btn-primary btn-sm">
              {pending ? 'Analyzing…' : 'Analyze & fill voice'}
            </button>
          </div>
        </details>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Personality" value={personality} onChange={setPersonality} />
          <Field label="Tone" value={tone} onChange={setTone} />
          <Field label="Values" value={values} onChange={setValues} />
          <Field label="Content themes" value={themes} onChange={setThemes} />
          <Field label="Audience keywords" value={audienceKw} onChange={setAudienceKw} />
          <Field label="Prohibition keywords" value={prohibitionKw} onChange={setProhibitionKw} />
          <Field label="Target audience" value={targetAudience} onChange={setTargetAudience} />
        </div>
      </Card>

      {/* 3. Guidelines */}
      <Card className="space-y-4">
        <SectionTitle>Guidelines &amp; examples</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Area label="Do (one per line)" value={doRules} onChange={setDoRules} />
          <Area label="Don't (one per line)" value={dontRules} onChange={setDontRules} />
          <Area label="Content we like (one per line)" value={likes} onChange={setLikes} />
          <Area label="Content we dislike (one per line)" value={dislikes} onChange={setDislikes} />
        </div>
      </Card>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-3 px-6 py-3">
          {msg && <span className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</span>}
          <button onClick={onSave} disabled={pending} className="btn-primary">
            {pending ? 'Saving…' : 'Save brand'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <textarea className="input" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
