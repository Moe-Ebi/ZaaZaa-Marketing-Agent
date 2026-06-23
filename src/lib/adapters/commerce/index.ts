// Commerce adapter — wraps WooCommerce REST API.
// All product/catalogue calls go through these functions, and they pull the
// tenant's WooCommerce credentials from the vault (Rule 1 + Rule 3) — never
// from env. The rest of the app passes an organizationId and gets typed results.
import { getCredentialJSON } from '@/lib/vault';

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
}

// Shape of a 'woocommerce' credential stored in the vault (as JSON).
export interface WooCommerceCredential {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

interface WooClient {
  storeUrl: string;
  authHeader: string;
}

// Resolve a tenant's WooCommerce client from the vault. Returns a typed failure
// if the credential is missing — the app never sees a raw vendor/auth error.
async function getWooClient(
  organizationId: number,
): Promise<CommerceResult<WooClient>> {
  const cred = await getCredentialJSON<WooCommerceCredential>(
    organizationId,
    'woocommerce',
  );
  if (!cred) {
    return { ok: false, error: 'No WooCommerce credential configured for this tenant' };
  }
  if (!cred.storeUrl || !cred.consumerKey || !cred.consumerSecret) {
    return { ok: false, error: 'WooCommerce credential is incomplete' };
  }
  const token = Buffer.from(`${cred.consumerKey}:${cred.consumerSecret}`).toString('base64');
  return {
    ok: true,
    data: {
      storeUrl: cred.storeUrl.replace(/\/+$/, ''),
      authHeader: `Basic ${token}`,
    },
  };
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
  date_created: string;
}

function mapProduct(organizationId: number, p: WooProduct): Product {
  return {
    id: `${organizationId}:${p.id}`,
    tenantId: String(organizationId),
    externalId: String(p.id),
    name: p.name,
    description: p.description ?? '',
    price: Number(p.price) || 0,
    currency: 'ZAR',
    imageUrls: (p.images ?? []).map((i) => i.src),
    categories: (p.categories ?? []).map((c) => c.name),
    inStock: p.stock_status === 'instock',
    stockQuantity: p.stock_quantity ?? undefined,
    createdAt: p.date_created,
  };
}

export async function getProducts(
  organizationId: number,
  opts: { perPage?: number; page?: number } = {},
): Promise<CommerceResult<Product[]>> {
  const client = await getWooClient(organizationId);
  if (!client.ok) return client;

  const perPage = opts.perPage ?? 20;
  const page = opts.page ?? 1;
  const url = `${client.data.storeUrl}/wp-json/wc/v3/products?per_page=${perPage}&page=${page}`;

  try {
    const res = await fetch(url, { headers: { Authorization: client.data.authHeader } });
    if (!res.ok) {
      return { ok: false, error: `WooCommerce responded ${res.status} ${res.statusText}` };
    }
    const raw = (await res.json()) as WooProduct[];
    return { ok: true, data: raw.map((p) => mapProduct(organizationId, p)) };
  } catch (err) {
    return { ok: false, error: `WooCommerce request failed: ${(err as Error).message}` };
  }
}

// The richer catalogue queries land in Module 3 (with the products sync table).
// They follow the SAME vault-backed pattern as getProducts above.
export async function getBestsellers(
  _organizationId: number,
  _limit?: number,
): Promise<CommerceResult<Product[]>> {
  throw new Error('getBestsellers: not implemented — wire in Module 3');
}

export async function getStockLevels(
  _organizationId: number,
): Promise<CommerceResult<Pick<Product, 'id' | 'inStock' | 'stockQuantity'>[]>> {
  throw new Error('getStockLevels: not implemented — wire in Module 3');
}

export async function getNewArrivals(
  _organizationId: number,
  _sinceDays?: number,
): Promise<CommerceResult<Product[]>> {
  throw new Error('getNewArrivals: not implemented — wire in Module 3');
}
