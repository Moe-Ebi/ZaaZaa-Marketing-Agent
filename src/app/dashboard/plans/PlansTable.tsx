'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlanSummary } from '@/lib/adapters/planning';
import { approvePlan } from '@/lib/actions/planning-actions';

function pct(p?: { total: number; generated: number }): string {
  if (!p || p.total === 0) return '—';
  return `${Math.round((p.generated / p.total) * 100)}% (${p.generated}/${p.total})`;
}

export function PlansTable({ plans }: { plans: PlanSummary[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>('all');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const rows = plans.filter((p) => filter === 'all' || p.status === filter);

  function onApprove(id: number) {
    setMsg(null);
    startTransition(async () => {
      const res = await approvePlan(id);
      setMsg(res.message);
      if (res.ok) setTimeout(() => router.refresh(), 800);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">Status</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border border-line bg-canvas px-2 py-1">
          {['all', 'draft', 'pending_review', 'approved', 'active'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {msg && <span className="text-muted">{msg}</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Season</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Start</th>
              <th className="px-4 py-2 font-medium">Month 1</th>
              <th className="px-4 py-2 font-medium">Month 2</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-subtle">No plans. Create one above.</td></tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2 text-muted">{p.season ?? '—'}</td>
                <td className="px-4 py-2 font-mono text-muted">{p.status}</td>
                <td className="px-4 py-2 text-subtle">{p.startDate}</td>
                <td className="px-4 py-2 text-muted">{pct(p.monthProgress[1])}</td>
                <td className="px-4 py-2 text-muted">{pct(p.monthProgress[2])}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/dashboard/plans/${p.id}/view`} className="text-brand hover:underline">View</Link>
                    {p.status === 'draft' && (
                      <button
                        disabled={pending}
                        onClick={() => onApprove(p.id)}
                        className="rounded border border-green-700 px-2 py-0.5 text-xs text-green-300 hover:bg-green-950 disabled:opacity-50"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
