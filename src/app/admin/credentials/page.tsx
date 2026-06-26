import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { listCredentialsMasked, listAuditLog } from '@/lib/vault';
import { AddCredentialForm, RotateForm } from './forms';

export const dynamic = 'force-dynamic';

export default async function CredentialsAdminPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const [credentials, audit] = await Promise.all([
    listCredentialsMasked(ctx.tenantId, { actorUserId: ctx.userId }),
    listAuditLog(ctx.tenantId, 25),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8 text-ink">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Credential Vault</h1>
        <p className="text-sm text-muted">
          Tenant #{ctx.tenantId} · operator: {ctx.email}. Values are encrypted at rest; only the
          last 4 characters are ever shown.
        </p>
      </header>

      <AddCredentialForm />

      <section className="space-y-3">
        <h2 className="font-medium">Active credentials</h2>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Label</th>
                <th className="px-4 py-2 font-medium">Value</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2 font-medium">Rotate</th>
              </tr>
            </thead>
            <tbody>
              {credentials.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-subtle">
                    No credentials yet — add one above.
                  </td>
                </tr>
              )}
              {credentials.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-2 font-mono">{c.credentialType}</td>
                  <td className="px-4 py-2 text-muted">{c.label ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-muted">{c.masked}</td>
                  <td className="px-4 py-2 text-subtle">{new Date(c.updatedAt).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <RotateForm credentialType={c.credentialType} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Audit log (latest 25)</h2>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-4 py-2 text-subtle">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono">{a.action}</td>
                  <td className="px-4 py-2 text-muted">{a.credentialType ?? '—'}</td>
                  <td className="px-4 py-2 text-subtle">{a.userId ? a.userId.slice(0, 8) : 'system'}</td>
                  <td className="px-4 py-2 text-subtle">{a.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
