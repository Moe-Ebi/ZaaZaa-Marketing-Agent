// Commerce adapter — wraps WooCommerce REST API
// All product/catalogue calls go through these functions.

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
  createdAt: Date;
  updatedAt: Date;
}

export async function getProducts(
  _tenantId: string,
): Promise<CommerceResult<Product[]>> {
  throw new Error('getProducts: not implemented — wire in Module 3');
}

export async function getBestsellers(
  _tenantId: string,
  _limit?: number,
): Promise<CommerceResult<Product[]>> {
  throw new Error('getBestsellers: not implemented — wire in Module 3');
}

export async function getStockLevels(
  _tenantId: string,
): Promise<CommerceResult<Pick<Product, 'id' | 'inStock' | 'stockQuantity'>[]>> {
  throw new Error('getStockLevels: not implemented — wire in Module 3');
}

export async function getNewArrivals(
  _tenantId: string,
  _sinceDays?: number,
): Promise<CommerceResult<Product[]>> {
  throw new Error('getNewArrivals: not implemented — wire in Module 3');
}
