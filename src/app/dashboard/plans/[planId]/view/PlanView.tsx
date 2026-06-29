'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlanDetail, PlanSection, PlannedItem } from '@/lib/adapters/planning';
import type { PlanPlatform } from '@/lib/adapters/planning/types';
import { approvePlan, editItemScript, regenerateWeek, reorderItem } from '@/lib/actions/planning-actions';

type RunFn = (fn: () => Promise<{ ok: boolean; message: string }>) => void;
type ViewMode = 'timeline' | 'calendar';

function monthProgressLabel(p?: { total: number; generated: number }): string {
  if (!p || p.total === 0) return 'no items';
  return `${p.generated}/${p.total} generated`;
}

export function PlanView({ plan }: { plan: PlanDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('timeline');

  const months = [1, 2, 3];
  const sectionsByMonth = (m: number) => plan.sections.filter((s) => s.month === m).sort((a, b) => a.week - b.week);

  const run: RunFn = (fn) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.ok) setTimeout(() => router.refresh(), 900);
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/dashboard/plans" className="text-sm text-subtle hover:text-muted">← Plans</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{plan.name}</h1>
          <p className="text-sm text-muted">
            {plan.season ?? '—'} · <span className="font-mono">{plan.status}</span> · {plan.startDate} → {plan.endDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {plan.status === 'draft' && (
            <button disabled={pending} onClick={() => run(() => approvePlan(plan.id))} className="btn-primary shrink-0">
              Approve plan
            </button>
          )}
        </div>
      </header>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="grid gap-2 sm:grid-cols-3">
        {months.map((m) => (
          <div key={m} className="card-2 p-3 text-sm">
            <p className="font-medium">Month {m}</p>
            <p className="text-xs text-subtle">{monthProgressLabel(plan.monthProgress[m])}</p>
          </div>
        ))}
      </div>

      {view === 'timeline' ? (
        <div className="space-y-6">
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
      ) : (
        <PlanCalendar plan={plan} pending={pending} onRun={run} />
      )}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
      {(['timeline', 'calendar'] as ViewMode[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 capitalize transition ${
            view === v ? 'bg-brand text-brand-ink' : 'text-muted hover:text-ink'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar view — month grids across the plan's date range, items on their day.
// Reuses ItemRow for the detail modal so content rendering isn't duplicated.
// ---------------------------------------------------------------------------
const PLATFORMS: (PlanPlatform | 'all')[] = ['all', 'instagram', 'tiktok', 'facebook'];
const STATUSES = ['all', 'planned', 'generating', 'ready_for_review', 'linked_to_content_item'] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function statusDot(status: string): string {
  if (status === 'linked_to_content_item') return 'bg-success';
  if (status === 'generating') return 'bg-warning';
  if (status === 'ready_for_review') return 'bg-info';
  return 'bg-subtle';
}

function PlanCalendar({ plan, pending, onRun }: { plan: PlanDetail; pending: boolean; onRun: RunFn }) {
  const [platform, setPlatform] = useState<PlanPlatform | 'all'>('all');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const [selected, setSelected] = useState<PlannedItem | null>(null);

  const allItems = useMemo(() => plan.sections.flatMap((s) => s.items), [plan.sections]);
  const filtered = useMemo(
    () =>
      allItems.filter(
        (it) =>
          (platform === 'all' || it.platforms.includes(platform)) &&
          (status === 'all' || it.status === status),
      ),
    [allItems, platform, status],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, PlannedItem[]>();
    for (const it of filtered) {
      if (!it.scheduledDate) continue;
      (m.get(it.scheduledDate) ?? m.set(it.scheduledDate, []).get(it.scheduledDate)!).push(it);
    }
    return m;
  }, [filtered]);

  const months = monthsBetween(plan.startDate, plan.endDate);
  const unscheduled = filtered.filter((it) => !it.scheduledDate);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted">Platform</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as PlanPlatform | 'all')} className="rounded border border-line bg-canvas px-2 py-1">
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])} className="rounded border border-line bg-canvas px-2 py-1">
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <span className="text-xs text-subtle">{filtered.length} items</span>
      </div>

      {months.map(({ year, month, label }) => (
        <section key={`${year}-${month}`} className="card overflow-hidden">
          <h3 className="border-b border-line px-4 py-2 text-sm font-medium">{label}</h3>
          <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-[11px] uppercase tracking-wide text-subtle">
            {WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {buildCells(year, month).map((day, i) => {
              const key = day ? dateKey(year, month, day) : `e${i}`;
              const items = day ? byDay.get(key) ?? [] : [];
              return (
                <div key={key} className={`min-h-20 border-b border-r border-line p-1 ${day ? '' : 'bg-canvas/40'}`}>
                  {day && <div className="mb-1 text-[11px] text-subtle">{day}</div>}
                  <div className="space-y-1">
                    {items.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => setSelected(it)}
                        className="flex w-full items-center gap-1 rounded bg-surface-2 px-1.5 py-1 text-left text-[11px] hover:bg-surface-3"
                        title={it.hook ?? ''}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(it.status)}`} />
                        <span className="truncate text-ink">
                          <span className="text-brand">{it.format}</span> · {it.hook}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {unscheduled.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted">Unscheduled ({unscheduled.length})</h3>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((it) => (
              <button key={it.id} onClick={() => setSelected(it)} className="card-2 px-2 py-1 text-xs hover:bg-surface-3">
                <span className="text-brand">{it.format}</span> · {it.hook}
              </button>
            ))}
          </div>
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/60" onClick={() => setSelected(null)} aria-label="Close" />
          <div className="relative z-10 w-full max-w-lg">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-muted">
                {selected.scheduledDate ?? 'Unscheduled'}
              </span>
              <button onClick={() => setSelected(null)} className="btn-ghost btn-sm">Close</button>
            </div>
            <ItemRow planId={plan.id} item={selected} pending={pending} onRun={onRun} />
          </div>
        </div>
      )}
    </div>
  );
}

function monthsBetween(startISO: string, endISO: string) {
  const start = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  const out: { year: number; month: number; label: string }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end && out.length < 6) {
    out.push({
      year: cur.getFullYear(),
      month: cur.getMonth(),
      label: cur.toLocaleString('en', { month: 'long', year: 'numeric' }),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function buildCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function WeekCard({
  planId, section, pending, onRun,
}: {
  planId: number;
  section: PlanSection;
  pending: boolean;
  onRun: RunFn;
}) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Week {section.week}{section.theme ? ` · ${section.theme}` : ''}</p>
          {section.hashtagStrategy && <p className="text-xs text-subtle">#: {section.hashtagStrategy}</p>}
        </div>
        <button
          disabled={pending}
          onClick={() => onRun(() => regenerateWeek(planId, section.month, section.week))}
          className="btn-ghost btn-sm"
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
  onRun: RunFn;
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
    <div className="card-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase text-brand">{item.format}</span>
        <span className={`text-xs ${statusColor}`}>{item.status.replace(/_/g, ' ')}</span>
      </div>
      {!editing ? (
        <>
          <p className="mt-1 text-ink">{item.hook}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{item.fullScript}</p>
        </>
      ) : (
        <div className="mt-2 space-y-2">
          <input className="input" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="hook" />
          <textarea className="input text-xs" rows={3} value={script} onChange={(e) => setScript(e.target.value)} placeholder="full script" />
          <button
            disabled={pending}
            onClick={() => { onRun(() => editItemScript(planId, item.id, script, hook)); setEditing(false); }}
            className="btn-primary btn-sm"
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
