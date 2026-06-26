'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ContentItem, ContentVariant } from '@/lib/content/types';
import type { Platform } from '@/lib/adapters/generation';
import {
  approveContent,
  rejectContent,
  updateContentBeforeApproval,
} from '../content-actions';

const ALL_PLATFORMS: Platform[] = ['instagram', 'tiktok', 'facebook'];

function scriptField(item: ContentItem, key: 'hook' | 'body' | 'cta'): string {
  return (item.script as Record<string, string>)[key] ?? '';
}
function scriptHashtags(item: ContentItem): string[] {
  return ((item.script as Record<string, unknown>).hashtags as string[]) ?? [];
}
function defaultCaption(item: ContentItem): string {
  if (item.caption) return item.caption;
  const tags = scriptHashtags(item).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  return [scriptField(item, 'hook'), scriptField(item, 'body'), scriptField(item, 'cta'), tags]
    .filter(Boolean)
    .join('\n\n');
}

const inputCls = 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand/60';

export function ApprovalCard({ item, variants }: { item: ContentItem; variants: ContentVariant[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const availablePlatforms = (Object.keys(item.finalVideoUrls) as Platform[]);
  const [selected, setSelected] = useState<Platform[]>(
    availablePlatforms.length ? availablePlatforms : ALL_PLATFORMS,
  );

  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(defaultCaption(item));
  const [hook, setHook] = useState(scriptField(item, 'hook'));
  const [hashtags, setHashtags] = useState(scriptHashtags(item).join(', '));

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  function togglePlatform(p: Platform) {
    setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  }

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) setTimeout(() => router.refresh(), 800);
    });
  }

  return (
    <article className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Item #{item.id} · {item.format ?? 'post'}</h3>
          <p className="text-xs text-subtle">Angle: {item.hookAngle ?? '—'}</p>
        </div>
        {item.error && <span className="text-xs text-orange-400" title={item.error}>⚠ degraded</span>}
      </header>

      {/* Per-platform preview cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {ALL_PLATFORMS.map((p) => {
          const url = item.finalVideoUrls[p];
          return (
            <div key={p} className="rounded-lg border border-line bg-canvas p-2">
              <p className="mb-1 text-xs font-medium uppercase text-muted">{p}</p>
              {url ? (
                <video src={url} poster={item.imageUrl ?? undefined} controls className="aspect-[9/16] w-full rounded bg-black object-cover" />
              ) : item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={p} className="aspect-[9/16] w-full rounded object-cover" />
              ) : (
                <div className="aspect-[9/16] w-full rounded bg-surface-2" />
              )}
            </div>
          );
        })}
      </div>

      {/* Caption */}
      <div className="rounded-lg border border-line bg-canvas p-3">
        <p className="mb-1 text-xs font-medium text-muted">Caption</p>
        <p className="whitespace-pre-wrap text-sm text-ink">{caption}</p>
      </div>

      {/* A/B variants */}
      {variants.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {variants.map((v) => (
            <div key={v.id} className="rounded-lg border border-line bg-canvas p-3">
              <p className="text-xs font-medium uppercase text-brand">{v.variantType}</p>
              <p className="mt-1 text-sm text-ink">{v.hook}</p>
              <p className="mt-1 text-xs text-subtle">Performance: — (Module 9)</p>
            </div>
          ))}
        </div>
      )}

      {/* Edit-before-publish */}
      {editing && (
        <div className="space-y-2 rounded-lg border border-brand/30 bg-brand/10 p-3">
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Hook</span>
            <input className={inputCls} value={hook} onChange={(e) => setHook(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Caption</span>
            <textarea className={inputCls} rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Hashtags (comma-separated)</span>
            <input className={inputCls} value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
          </label>
          <button
            disabled={pending}
            onClick={() =>
              run(() =>
                updateContentBeforeApproval(item.id, {
                  hook,
                  caption,
                  hashtags: hashtags.split(',').map((h) => h.trim()).filter(Boolean),
                }),
              )
            }
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-brand-strong disabled:opacity-50"
          >
            Save edits
          </button>
        </div>
      )}

      {/* Platform selection */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">Publish to:</span>
        {ALL_PLATFORMS.map((p) => (
          <label key={p} className="flex items-center gap-1.5">
            <input type="checkbox" checked={selected.includes(p)} onChange={() => togglePlatform(p)} />
            <span className={selected.includes(p) ? 'text-ink' : 'text-subtle'}>{p}</span>
          </label>
        ))}
      </div>

      {/* Reject reason */}
      {rejecting && (
        <div className="flex items-center gap-2">
          <input
            className={inputCls}
            placeholder="Reason for rejection…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            disabled={pending}
            onClick={() => run(() => rejectContent(item.id, reason))}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            Confirm reject
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          onClick={() => run(() => approveContent(item.id, caption, selected))}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={pending}
          onClick={() => setRejecting((r) => !r)}
          className="rounded-lg border border-red-700 px-4 py-2 text-sm text-danger hover:bg-red-950 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          disabled={pending}
          onClick={() => setEditing((e) => !e)}
          className="rounded-lg border border-line-strong px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
        >
          {editing ? 'Close editor' : 'Edit'}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</span>}
      </div>
    </article>
  );
}
