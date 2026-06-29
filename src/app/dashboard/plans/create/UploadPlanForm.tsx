'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPlan } from '@/lib/actions/planning-actions';

export function UploadPlanForm() {
  const router = useRouter();
  const [season, setSeason] = useState('');
  const [focus, setFocus] = useState('');
  const [pasted, setPasted] = useState('');
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onExtract() {
    const file = fileRef.current?.files?.[0];
    if (!file && !pasted.trim()) {
      setMsg({ ok: false, text: 'Choose a file or paste the plan text' });
      return;
    }
    const fd = new FormData();
    if (file) fd.append('file', file);
    fd.append('pastedText', pasted);
    fd.append('season', season);
    fd.append('marketingFocus', focus);
    setMsg(null);
    startTransition(async () => {
      const res = await uploadPlan(fd);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok && res.planId) {
        router.push(`/dashboard/plans/${res.planId}/view`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="label">Season / campaign (optional hint)</span>
            <input className="input" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="e.g. Winter 2026" />
          </label>
          <label className="space-y-1">
            <span className="label">Marketing focus (optional hint)</span>
            <input className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. boot sales" />
          </label>
        </div>

        <div className="space-y-1">
          <span className="label">Upload a plan — PDF, DOCX or TXT</span>
          <div className="flex items-center gap-3">
            <button onClick={() => fileRef.current?.click()} className="btn-ghost btn-sm">Choose file</button>
            <span className="text-sm text-muted">{fileName || 'No file selected'}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,text/plain"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
              className="hidden"
            />
          </div>
        </div>

        <div className="space-y-1">
          <span className="label">…or paste the plan text</span>
          <textarea
            className="input font-mono text-xs"
            rows={7}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste an existing marketing plan here — themes, monthly breakdown, post ideas…"
          />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onExtract} disabled={pending} className="btn-primary">
            {pending ? 'Extracting with Claude…' : 'Extract & create plan'}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</span>}
        </div>
      </section>

      <p className="text-xs text-subtle">
        Claude reads the document, maps products to your catalogue, and structures it into the same
        3-month plan format. You&apos;ll land on the plan page to review, edit and approve — exactly like a
        generated plan.
      </p>
    </div>
  );
}
