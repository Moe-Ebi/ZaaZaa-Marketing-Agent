'use client';

import { useMemo, useState } from 'react';
import type { ContentItem, ContentState, ContentVariant } from '@/lib/content/types';
import type { Platform } from '@/lib/adapters/generation';
import type { PublicationRecord } from '@/lib/adapters/publishing';

const STATES: (ContentState | 'all')[] = [
  'all', 'draft', 'generating', 'ready_for_review', 'waiting_for_credits',
  'failed_retryable', 'approved', 'scheduled', 'published', 'analyzed',
];
const PLATFORMS: (Platform | 'all')[] = ['all', 'instagram', 'tiktok', 'facebook'];

export function HistoryView({
  items,
  variantsByItem,
  publicationsByItem,
}: {
  items: ContentItem[];
  variantsByItem: Record<number, ContentVariant[]>;
  publicationsByItem: Record<number, PublicationRecord[]>;
}) {
  const [state, setState] = useState<ContentState | 'all'>('all');
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const [open, setOpen] = useState<number | null>(null);

  const rows = useMemo(() => {
    return items.filter((it) => {
      if (state !== 'all' && it.state !== state) return false;
      if (platform !== 'all') {
        const ps = it.platforms.length ? it.platforms : (Object.keys(it.finalVideoUrls) as Platform[]);
        if (!ps.includes(platform)) return false;
      }
      return true;
    });
  }, [items, state, platform]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted">State</span>
          <select value={state} onChange={(e) => setState(e.target.value as ContentState | 'all')} className="rounded border border-line bg-canvas px-2 py-1">
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted">Platform</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform | 'all')} className="rounded border border-line bg-canvas px-2 py-1">
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <span className="self-center text-xs text-subtle">{rows.length} of {items.length}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">Format</th>
              <th className="px-4 py-2 font-medium">Platforms</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium">Published</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-subtle">No items match.</td></tr>
            )}
            {rows.map((it) => {
              const ps = it.platforms.length ? it.platforms : Object.keys(it.finalVideoUrls);
              const expanded = open === it.id;
              return (
                <FragmentRow
                  key={it.id}
                  item={it}
                  platforms={ps}
                  expanded={expanded}
                  variants={variantsByItem[it.id] ?? []}
                  publications={publicationsByItem[it.id] ?? []}
                  onToggle={() => setOpen(expanded ? null : it.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  item, platforms, expanded, variants, publications, onToggle,
}: {
  item: ContentItem;
  platforms: string[];
  expanded: boolean;
  variants: ContentVariant[];
  publications: PublicationRecord[];
  onToggle: () => void;
}) {
  const script = item.script as { hook?: string; body?: string; cta?: string; hashtags?: string[] };
  return (
    <>
      <tr className="border-t border-line">
        <td className="px-4 py-2 text-subtle">{item.id}</td>
        <td className="px-4 py-2 font-mono text-muted">{item.state}</td>
        <td className="px-4 py-2">{item.format ?? '—'}</td>
        <td className="px-4 py-2 text-muted">{platforms.join(', ') || '—'}</td>
        <td className="px-4 py-2 text-subtle">{new Date(item.createdAt).toLocaleDateString()}</td>
        <td className="px-4 py-2 text-subtle">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : '—'}</td>
        <td className="px-4 py-2 text-right">
          <button onClick={onToggle} className="text-xs text-brand hover:underline">{expanded ? 'Hide' : 'Details'}</button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-line bg-canvas/50">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 text-xs">
                <p className="text-muted">Hook</p>
                <p className="text-ink">{script.hook ?? '—'}</p>
                <p className="mt-2 text-muted">Body</p>
                <p className="text-muted">{script.body ?? '—'}</p>
                <p className="mt-2 text-muted">CTA</p>
                <p className="text-muted">{script.cta ?? '—'}</p>
                {script.hashtags?.length ? <p className="mt-2 text-subtle">{script.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}</p> : null}
              </div>
              <div className="space-y-2 text-xs">
                <p className="text-muted">A/B variants</p>
                {variants.length === 0 ? <p className="text-subtle">—</p> : variants.map((v) => (
                  <p key={v.id}><span className="font-mono text-brand">{v.variantType}:</span> <span className="text-muted">{v.hook}</span></p>
                ))}
                <p className="mt-2 text-muted">Outputs</p>
                {Object.entries(item.finalVideoUrls).length === 0 ? <p className="text-subtle">—</p> :
                  Object.entries(item.finalVideoUrls).map(([p, u]) => (
                    <p key={p}><a href={u} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{p} MP4 ↗</a></p>
                  ))}
                <p className="mt-2 text-muted">Publications</p>
                {publications.length === 0 ? <p className="text-subtle">—</p> : publications.map((p) => (
                  <p key={p.id}>
                    <span className={p.status === 'published' ? 'text-success' : p.status === 'failed' ? 'text-danger' : 'text-warning'}>
                      {p.platform}: {p.status}
                    </span>
                    {p.platformPostId ? <span className="text-subtle"> · {p.platformPostId.slice(0, 12)}…</span> : null}
                    {p.errorMessage ? <span className="text-subtle" title={p.errorMessage}> · {p.errorMessage.slice(0, 40)}</span> : null}
                  </p>
                ))}
                <p className="mt-2 text-subtle">Usage cost: per-item attribution arrives with billing (Module 10)</p>
                {item.rejectionReason && <p className="text-danger">Rejected: {item.rejectionReason}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
