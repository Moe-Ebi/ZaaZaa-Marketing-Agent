import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { getProducts, getBestsellers, getNewArrivals, type Product } from '@/lib/adapters/commerce';
import { ProductsTable, SyncNowButton } from './ProductsTable';

export const dynamic = 'force-dynamic';

function Highlight({ title, products }: { title: string; products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-zinc-300">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {products.slice(0, 4).map((p) => (
          <div key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            {p.imageUrls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrls[0]} alt={p.name} className="mb-2 h-24 w-full rounded object-cover" />
            ) : (
              <div className="mb-2 h-24 w-full rounded bg-zinc-800" />
            )}
            <p className="truncate text-xs text-zinc-200" title={p.name}>{p.name}</p>
            <p className="text-xs text-zinc-500">R{p.price.toFixed(2)} · {p.salesRank ?? 0} sold</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function ProductsDashboardPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const [productsRes, bestsellersRes, newArrivalsRes] = await Promise.all([
    getProducts(ctx.tenantId),
    getBestsellers(ctx.tenantId, 4),
    getNewArrivals(ctx.tenantId, 30),
  ]);

  const products = productsRes.ok ? productsRes.data : [];
  const bestsellers = bestsellersRes.ok ? bestsellersRes.data : [];
  const newArrivals = newArrivalsRes.ok ? newArrivalsRes.data : [];

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8 text-zinc-50">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-zinc-400">
            Tenant #{ctx.tenantId} · {products.length} products synced from WooCommerce.
          </p>
        </div>
        <SyncNowButton />
      </header>

      {!productsRes.ok && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          Could not load products: {productsRes.error}
        </p>
      )}

      <Highlight title="🔥 Bestsellers" products={bestsellers} />
      <Highlight title="🆕 New arrivals (last 30 days)" products={newArrivals} />

      <section className="space-y-3">
        <h2 className="font-medium">All products</h2>
        <ProductsTable products={products} />
      </section>
    </main>
  );
}
