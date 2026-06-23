// ============================================================================
// WooCommerce live client (private to the commerce adapter).
// ----------------------------------------------------------------------------
// Pulls the tenant's credential from the vault (Rule 1 + Rule 3) and talks to
// the WooCommerce REST API, handling pagination (100 items/page). Returns rows
// normalized for the products cache. The PUBLIC adapter (./index.ts) reads from
// that cache; only the Inngest sync job calls this module, so we never hammer
// WooCommerce on app requests.
// ============================================================================
import { getCredentialJSON } from '@/lib/vault';
import type { CommerceResult } from './index';

export interface WooCommerceCredential {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

// A product row normalized for upsert into public.products.
export interface ProductRow {
  woocommerce_id: number;
  title: string;
  description: string;
  image_url: string | null;
  price: number | null;
  stock_level: number | null;
  stock_status: string | null;
  category: string | null;
  total_sales: number;
  woo_created_at: string | null;
}

interface WooClient {
  storeUrl: string;
  authHeader: string;
}

interface WooProduct {
  id: number;
  name: string;
  description: string;
  price: string;
  images?: { src: string }[];
  categories?: { name: string }[];
  stock_status: string;
  stock_quantity: number | null;
  total_sales?: number;
  date_created: string;
}

const PER_PAGE = 100; // WooCommerce max page size

async function getWooClient(organizationId: number): Promise<CommerceResult<WooClient>> {
  const cred = await getCredentialJSON<WooCommerceCredential>(organizationId, 'woocommerce');
  if (!cred) {
    return { ok: false, error: 'No WooCommerce credential configured for this tenant' };
  }
  if (!cred.storeUrl || !cred.consumerKey || !cred.consumerSecret) {
    return { ok: false, error: 'WooCommerce credential is incomplete' };
  }
  const token = Buffer.from(`${cred.consumerKey}:${cred.consumerSecret}`).toString('base64');
  return {
    ok: true,
    data: { storeUrl: cred.storeUrl.replace(/\/+$/, ''), authHeader: `Basic ${token}` },
  };
}

function mapRow(p: WooProduct): ProductRow {
  return {
    woocommerce_id: p.id,
    title: p.name,
    description: p.description ?? '',
    image_url: p.images?.[0]?.src ?? null,
    price: p.price === '' || p.price == null ? null : Number(p.price),
    stock_level: p.stock_quantity ?? null,
    stock_status: p.stock_status ?? null,
    category: (p.categories ?? []).map((c) => c.name).join(', ') || null,
    total_sales: p.total_sales ?? 0,
    woo_created_at: p.date_created ?? null,
  };
}

/**
 * Fetch every product from the tenant's WooCommerce store, following pagination
 * until all pages are read. Extra query params (orderby, after, …) are merged in.
 */
export async function fetchAllProducts(
  organizationId: number,
  params: Record<string, string> = {},
): Promise<CommerceResult<ProductRow[]>> {
  const client = await getWooClient(organizationId);
  if (!client.ok) return client;

  const rows: ProductRow[] = [];
  let page = 1;

  try {
    // Loop pages until WooCommerce returns fewer than PER_PAGE items.
    for (;;) {
      const qs = new URLSearchParams({
        per_page: String(PER_PAGE),
        page: String(page),
        ...params,
      });
      const url = `${client.data.storeUrl}/wp-json/wc/v3/products?${qs.toString()}`;
      const res = await fetch(url, { headers: { Authorization: client.data.authHeader } });
      if (!res.ok) {
        return { ok: false, error: `WooCommerce responded ${res.status} ${res.statusText}` };
      }
      const batch = (await res.json()) as WooProduct[];
      rows.push(...batch.map(mapRow));

      if (batch.length < PER_PAGE) break;
      page += 1;
      if (page > 100) break; // hard safety cap (10k products)
    }
    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: `WooCommerce request failed: ${(err as Error).message}` };
  }
}

/** Live bestsellers (WooCommerce popularity = total_sales). */
export function fetchBestsellers(organizationId: number): Promise<CommerceResult<ProductRow[]>> {
  return fetchAllProducts(organizationId, { orderby: 'popularity', order: 'desc' });
}

/** Live new arrivals — products created within the last `sinceDays` days. */
export function fetchNewArrivals(
  organizationId: number,
  sinceDays = 30,
): Promise<CommerceResult<ProductRow[]>> {
  const after = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  return fetchAllProducts(organizationId, { after });
}
