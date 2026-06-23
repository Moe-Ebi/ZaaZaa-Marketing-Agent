// Commerce adapter (public interface).
// ----------------------------------------------------------------------------
// These functions are CACHE-FIRST: they read the tenant's synced products from
// the public.products table (populated by the Inngest sync job, which uses the
// live client in ./woocommerce.ts). This keeps the app fast and avoids hammering
// WooCommerce (Rule 4). The rest of the app calls these and never knows the
// vendor (Rule 1). Reads are explicitly scoped by organization_id.
import { createAdminClient } from '@/lib/supabase/admin';

export type CommerceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface Product {
  id: string;
  tenantId: string;
  externalId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrls: string[];
  categories: string[];
  inStock: boolean;
  stockQuantity?: number;
  salesRank?: number;
  createdAt: string;
  syncedAt: string;
}

interface ProductRecord {
  woocommerce_id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  stock_level: number | null;
  stock_status: string | null;
  category: string | null;
  total_sales: number;
  woo_created_at: string | null;
  synced_at: string;
}

function mapProduct(organizationId: number, r: ProductRecord): Product {
  return {
    id: `${organizationId}:${r.woocommerce_id}`,
    tenantId: String(organizationId),
    externalId: String(r.woocommerce_id),
    name: r.title,
    description: r.description ?? '',
    price: r.price ?? 0,
    currency: 'ZAR',
    imageUrls: r.image_url ? [r.image_url] : [],
    categories: r.category ? r.category.split(', ') : [],
    inStock: r.stock_status === 'instock',
    stockQuantity: r.stock_level ?? undefined,
    salesRank: r.total_sales,
    createdAt: r.woo_created_at ?? '',
    syncedAt: r.synced_at,
  };
}

const SELECT =
  'woocommerce_id, title, description, image_url, price, stock_level, stock_status, category, total_sales, woo_created_at, synced_at';

const PAGE = 1000; // PostgREST caps a single read at 1000 rows

// Page through every product row for a tenant (catalogues can exceed 1000).
async function selectAllRows<T>(
  columns: string,
  organizationId: number,
  orderColumn: string,
): Promise<{ data?: T[]; error?: string }> {
  const admin = createAdminClient();
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('products')
      .select(columns)
      .eq('organization_id', organizationId)
      .order(orderColumn)
      .range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return { data: all };
}

/** All cached products for a tenant (sorted by title). */
export async function getProducts(organizationId: number): Promise<CommerceResult<Product[]>> {
  const { data, error } = await selectAllRows<ProductRecord>(SELECT, organizationId, 'title');
  if (error) return { ok: false, error };
  return { ok: true, data: (data ?? []).map((r) => mapProduct(organizationId, r)) };
}

/** Top sellers by WooCommerce total_sales. */
export async function getBestsellers(
  organizationId: number,
  limit = 10,
): Promise<CommerceResult<Product[]>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('products')
    .select(SELECT)
    .eq('organization_id', organizationId)
    .gt('total_sales', 0)
    .order('total_sales', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((r) => mapProduct(organizationId, r as ProductRecord)) };
}

/** Current stock levels for a tenant's products. */
export async function getStockLevels(
  organizationId: number,
): Promise<CommerceResult<Pick<Product, 'id' | 'inStock' | 'stockQuantity'>[]>> {
  const { data, error } = await selectAllRows<{
    woocommerce_id: number;
    stock_status: string | null;
    stock_level: number | null;
  }>('woocommerce_id, stock_status, stock_level', organizationId, 'woocommerce_id');
  if (error) return { ok: false, error };
  const rows = (data ?? []).map((r) => ({
    id: `${organizationId}:${r.woocommerce_id}`,
    inStock: r.stock_status === 'instock',
    stockQuantity: r.stock_level ?? undefined,
  }));
  return { ok: true, data: rows };
}

/** Products created in WooCommerce within the last `sinceDays` days. */
export async function getNewArrivals(
  organizationId: number,
  sinceDays = 30,
): Promise<CommerceResult<Product[]>> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('products')
    .select(SELECT)
    .eq('organization_id', organizationId)
    .gte('woo_created_at', since)
    .order('woo_created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((r) => mapProduct(organizationId, r as ProductRecord)) };
}
