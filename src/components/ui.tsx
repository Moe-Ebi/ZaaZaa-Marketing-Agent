// ============================================================================
// Shared UI primitives — thin, Tailwind-class based (same approach used across
// the app), centralized so every page stays visually consistent.
// ============================================================================
import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">{children}</h2>;
}

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
}) {
  const tones: Record<string, string> = {
    default: 'border-line bg-surface-2 text-muted',
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    danger: 'border-danger/30 bg-danger/10 text-danger',
    info: 'border-info/30 bg-info/10 text-info',
    brand: 'border-brand/30 bg-brand/10 text-brand',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="text-3xl opacity-70">{icon}</div>}
      <div className="space-y-1">
        <p className="font-medium text-ink">{title}</p>
        {description && <p className="mx-auto max-w-md text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
      {children}
    </div>
  );
}

// Map content/plan states to badge tones, used across approvals/history/plans.
export function StateBadge({ state }: { state: string }) {
  const tone: Record<string, Parameters<typeof Badge>[0]['tone']> = {
    draft: 'default',
    generating: 'warning',
    waiting_for_credits: 'warning',
    failed_retryable: 'danger',
    ready_for_review: 'info',
    approved: 'success',
    scheduled: 'brand',
    published: 'success',
    analyzed: 'default',
    active: 'success',
    pending_review: 'info',
    planned: 'default',
    linked_to_content_item: 'success',
    published_failed: 'danger',
  };
  return <Badge tone={tone[state] ?? 'default'}>{state.replace(/_/g, ' ')}</Badge>;
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-subtle">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {it.href ? (
            <Link href={it.href} className="transition hover:text-muted">{it.label}</Link>
          ) : (
            <span className="text-muted">{it.label}</span>
          )}
          {i < items.length - 1 && <span className="text-line-strong">/</span>}
        </span>
      ))}
    </nav>
  );
}
