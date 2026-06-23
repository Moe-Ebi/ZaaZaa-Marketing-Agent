// Billing adapter — wraps Paystack / Peach Payments (ZAR) and Stripe (international)
// All subscription and usage metering calls go through these functions.

export type BillingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type BillingTier = 'starter' | 'growth' | 'pro' | 'enterprise';

export interface Subscription {
  tenantId: string;
  tier: BillingTier;
  currency: 'ZAR' | 'USD';
  renewsAt: Date;
  cancelledAt?: Date;
}

export interface UsageEvent {
  tenantId: string;
  eventType: 'image_generation' | 'video_generation' | 'voiceover' | 'script';
  quantity: number;
  costCents: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export async function createSubscription(
  _tenantId: string,
  _tier: BillingTier,
  _currency: 'ZAR' | 'USD',
): Promise<BillingResult<Subscription>> {
  throw new Error('createSubscription: not implemented — wire in Module 10');
}

export async function recordUsage(
  _event: Omit<UsageEvent, 'createdAt'>,
): Promise<BillingResult<UsageEvent>> {
  throw new Error('recordUsage: not implemented — wire in Module 10');
}

export async function checkTierAllowance(
  _tenantId: string,
  _eventType: UsageEvent['eventType'],
): Promise<BillingResult<{ allowed: boolean; remaining: number }>> {
  throw new Error('checkTierAllowance: not implemented — wire in Module 10');
}
