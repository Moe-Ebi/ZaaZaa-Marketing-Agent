'use client';

import { useMemo, useState } from 'react';
import { useActionState } from 'react';
import type { Product } from '@/lib/adapters/commerce';
import { triggerSync, type SyncActionState } from './actions';

type SortKey = 'name' | 'price' | 'stock' | 'sales';

const initial: SyncActionState = { ok: false, message: '' };

export function SyncNowButton() {
  const [state, formAction, pending] = useActionState(triggerSync, initial);
  return (
    <form action={formAction} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
      >
        {pending ? 'Queuing…' : 'Sync now'}
      </button>
      {state.message && (
        <span className={`text-sm ${state.ok ? 'text-green-400' : 'text-red-400'}`}>{state.message}</span>
      )}
    </form>
  );
}

export function ProductsTable({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const filtered = products.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()),
    );
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sort) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'price': cmp = a.price - b.price; break;
        case 'stock': cmp = (a.stockQuantity ?? -1) - (b.stockQuantity ?? -1); break;
        case 'sales': cmp = (a.salesRank ?? 0) - (b.salesRank ?? 0); break;
      }
      return asc ? cmp : -cmp;
    });
    return sorted;
  }, [products, query, sort, asc]);

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc(!asc);
    else { setSort(key); setAsc(true); }
  }

  const arrow = (key: SortKey) => (sort === key ? (asc ? ' ↑' : ' ↓') : '');

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by title…"
        className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500"
      />
      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="cursor-pointer px-4 py-2 font-medium" onClick={() => toggleSort('name')}>Title{arrow('name')}</th>
              <th className="cursor-pointer px-4 py-2 font-medium" onClick={() => toggleSort('price')}>Price{arrow('price')}</th>
              <th className="cursor-pointer px-4 py-2 font-medium" onClick={() => toggleSort('stock')}>Stock{arrow('stock')}</th>
              <th className="cursor-pointer px-4 py-2 font-medium" onClick={() => toggleSort('sales')}>Sales{arrow('sales')}</th>
              <th className="px-4 py-2 font-medium">Last synced</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-zinc-500">No products — run a sync.</td></tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-zinc-800">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2 font-mono">R{p.price.toFixed(2)}</td>
                <td className="px-4 py-2">
                  {p.inStock ? (
                    <span className="text-zinc-300">{p.stockQuantity ?? 'in stock'}</span>
                  ) : (
                    <span className="text-red-400">out</span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-400">{p.salesRank ?? 0}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {p.syncedAt ? new Date(p.syncedAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">{rows.length} of {products.length} products</p>
    </div>
  );
}
