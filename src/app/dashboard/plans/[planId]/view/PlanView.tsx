'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlanDetail, PlanSection, PlannedItem } from '@/lib/adapters/planning';
import { approvePlan, editItemScript, regenerateWeek, reorderItem } from '@/lib/actions/planning-actions';

function monthProgressLabel(p?: { total: number; generated: number }): string {
  if (!p || p.total === 0) return 'no items';
  return `${p.generated}/${p.total} generated`;
}

export function PlanView({ plan }: { plan: PlanDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const months = [1, 2, 3];
  const sectionsByMonth = (m: number) => plan.sections.filter((s) => s.month === m).sort((a, b) => a.week - b.week);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.ok) setTimeout(() => router.refresh(), 900);
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/dashboard/plans" className="text-sm text-subtle hover:text-muted">← Plans</Link>
          <h1 className="text-2xl font-semibold">{plan.name}</h1>
          <p className="text-sm text-muted">
            {plan.season ?? '—'} · <span className="font-mono">{plan.status}</span> · {plan.startDate} → {plan.endDate}
          </p>
        </div>
        {plan.status === 'draft' && (
          <button
            disabled={pending}
            onClick={() => run(() => approvePlan(plan.id))}
            className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            Approve plan
          </button>
        )}
      </header>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="grid gap-2 sm:grid-cols-3">
        {months.map((m) => (
          <div key={m} className="rounded-lg border border-line bg-surface p-3 text-sm">
            <p className="font-medium">Month {m}</p>
            <p className="text-xs text-subtle">{monthProgressLabel(plan.monthProgress[m])}</p>
          </div>
        ))}
      </div>

      {months.map((m) => {
        const sections = sectionsByMonth(m);
        if (sections.length === 0) return null;
        return (
          <section key={m} className="space-y-3">
            <h2 className="text-sm font-medium text-muted">Month {m}</h2>
            {sections.map((s) => (
              <WeekCard key={s.id} planId={plan.id} section={s} pending={pending} onRun={run} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function WeekCard({
  planId, section, pending, onRun,
}: {
  planId: number;
  section: PlanSection;
  pending: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; message: string }>) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Week {section.week}{section.theme ? ` · ${section.theme}` : ''}</p>
          {section.hashtagStrategy && <p className="text-xs text-subtle">#: {section.hashtagStrategy}</p>}
        </div>
        <button
          disabled={pending}
          onClick={() => onRun(() => regenerateWeek(planId, section.month, section.week))}
          className="rounded border border-line-strong px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
        >
          Regenerate week
        </button>
      </div>
      <div className="space-y-2">
        {section.items.map((it) => (
          <ItemRow key={it.id} planId={planId} item={it} pending={pending} onRun={onRun} />
        ))}
      </div>
    </div>
  );
}

function ItemRow({
  planId, item, pending, onRun,
}: {
  planId: number;
  item: PlannedItem;
  pending: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; message: string }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hook, setHook] = useState(item.hook ?? '');
  const [script, setScript] = useState(item.fullScript ?? '');
  const [date, setDate] = useState(item.scheduledDate ?? '');

  const statusColor =
    item.status === 'linked_to_content_item' ? 'text-success'
      : item.status === 'generating' ? 'text-warning'
        : 'text-subtle';

  return (
    <div className="rounded-lg border border-line bg-canvas p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase text-brand">{item.format}</span>
        <span className={`text-xs ${statusColor}`}>{item.status}</span>
      </div>
      {!editing ? (
        <>
          <p className="mt-1 text-ink">{item.hook}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{item.fullScript}</p>
        </>
      ) : (
        <div className="mt-2 space-y-2">
          <input className="w-full rounded border border-line bg-surface px-2 py-1 text-sm" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="hook" />
          <textarea className="w-full rounded border border-line bg-surface px-2 py-1 text-xs" rows={3} value={script} onChange={(e) => setScript(e.target.value)} placeholder="full script" />
          <button
            disabled={pending}
            onClick={() => { onRun(() => editItemScript(planId, item.id, script, hook)); setEditing(false); }}
            className="rounded bg-brand px-2 py-1 text-xs font-medium text-brand-ink hover:bg-brand-strong disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-subtle">
        <span>{item.platforms.join(', ') || '—'}</span>
        <span className="flex items-center gap-1">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-line bg-surface px-1 py-0.5 text-xs" />
          <button disabled={pending || !date} onClick={() => onRun(() => reorderItem(planId, item.id, date))} className="hover:text-muted disabled:opacity-50">move</button>
        </span>
        <button onClick={() => setEditing((e) => !e)} className="hover:text-muted">{editing ? 'cancel' : 'edit'}</button>
        {item.linkedContentItemId && (
          <Link href="/dashboard/approvals" className="text-brand hover:underline">→ content #{item.linkedContentItemId}</Link>
        )}
      </div>
    </div>
  );
}
