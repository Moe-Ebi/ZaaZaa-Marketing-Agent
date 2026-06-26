'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Item = { href: string; label: string; icon: keyof typeof ICONS };
type Group = { heading: string; items: Item[] };

const NAV: Group[] = [
  { heading: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: 'home' }] },
  {
    heading: 'Create',
    items: [
      { href: '/dashboard/content', label: 'Content', icon: 'spark' },
      { href: '/dashboard/plans', label: 'Plans', icon: 'map' },
      { href: '/dashboard/brand-profile', label: 'Brand', icon: 'palette' },
    ],
  },
  {
    heading: 'Review & schedule',
    items: [
      { href: '/dashboard/approvals', label: 'Approvals', icon: 'check' },
      { href: '/dashboard/calendar', label: 'Calendar', icon: 'calendar' },
      { href: '/dashboard/history', label: 'History', icon: 'clock' },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { href: '/dashboard/analytics', label: 'Analytics', icon: 'chart' },
      { href: '/dashboard/products', label: 'Products', icon: 'tag' },
    ],
  },
  { heading: 'Admin', items: [{ href: '/admin/credentials', label: 'Credentials', icon: 'key' }] },
];

const ICONS = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h14V10',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-1-.5-2 .8-1.5 1.5-1.5H18a3 3 0 0 0 3-3 8 8 0 0 0-9-6.5ZM7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm4-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  check: 'M4 12.5 9 17.5 20 6.5',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  chart: 'M5 21V10M12 21V4M19 21v-7',
  tag: 'M3 12 12 3h7v7l-9 9-7-7Zm12.5-4.5h.01',
  key: 'M14 7a4 4 0 1 1-5.7 3.6L3 16v3h3l1-1h2v-2h2l1.3-1.3A4 4 0 0 1 14 7Zm2 1h.01',
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Sidebar({ email, tenantId }: { email: string; tenantId: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV.map((group) => (
        <div key={group.heading} className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-subtle">{group.heading}</p>
          {group.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className={`nav-link ${isActive(it.href) ? 'nav-link-active' : ''}`}
            >
              <Icon name={it.icon} />
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2 px-5 py-4">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-ink">Z</span>
      <span className="text-sm font-semibold tracking-tight text-ink">ZaaZaa</span>
      <span className="text-xs text-subtle">Agent</span>
    </Link>
  );

  const footer = (
    <div className="border-t border-line px-4 py-3">
      <p className="truncate text-xs text-muted" title={email}>{email}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-subtle">Tenant #{tenantId}</span>
        <button onClick={signOut} className="text-[11px] text-subtle transition hover:text-danger">Sign out</button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        {brand}
        <button onClick={() => setOpen((v) => !v)} className="btn-ghost btn-sm" aria-label="Menu">☰</button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-line bg-surface">
            {brand}{nav}{footer}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        {brand}{nav}{footer}
      </aside>
    </>
  );
}
