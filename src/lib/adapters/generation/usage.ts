// ============================================================================
// Usage metering (Rule 5) — every billable generation call records an event.
// ----------------------------------------------------------------------------
// recordUsage writes a usage_event; checkTierAllowance is a stub for now (just
// logs) that Module 10 will turn into real allowance enforcement. The metric in
// tokens_or_credits_used is per event type: tokens (script/caption), credits
// (image/video), characters (voiceover), seconds (assembly).
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import type { GenerationEventType } from './types';

// Rough USD unit costs for estimating spend (re-verify before billing — Module 10).
const UNIT_COST: Record<GenerationEventType, (amount: number) => number> = {
  script: (tokens) => (tokens / 1_000_000) * 6, // gpt-4o blended ~$6/1M
  caption: (tokens) => (tokens / 1_000_000) * 6,
  image: (credits) => credits * 0.15, // Higgsfield Soul ~ $0.12–0.23
  video: (credits) => credits * 0.4, // Higgsfield video ~ $0.16–0.70
  voiceover: (chars) => (chars / 1_000_000) * 15, // OpenAI TTS ~$15/1M chars
  assembly: (seconds) => (seconds / 60) * 0.4, // Shotstack ~$0.40/rendered min
  analytics_pull: () => 0, // wrapper analytics reads are not separately billed
  video_generation_higgsfield: (seconds) => seconds * 0.08, // Higgsfield video ~ per-second
};

export interface AllowanceCheck {
  allowed: boolean;
  remaining: number; // -1 = unmetered (stub)
}

/**
 * Stub allowance check. Module 10 will read the tenant's plan + month-to-date
 * usage_events and enforce limits. For now it always allows and logs.
 */
export async function checkTierAllowance(
  organizationId: number,
  eventType: GenerationEventType,
): Promise<AllowanceCheck> {
  console.log(`[usage] allowance check: org ${organizationId}, ${eventType} → allowed (stub)`);
  return { allowed: true, remaining: -1 };
}

/**
 * Record a billable event. `amount` is the event's primary metric (tokens /
 * credits / characters / seconds). Cost is estimated from UNIT_COST.
 */
export async function recordUsage(
  organizationId: number,
  eventType: GenerationEventType,
  amount: number,
  detail?: string,
): Promise<void> {
  const costEstimate = UNIT_COST[eventType](amount);
  const admin = createAdminClient();
  const { error } = await admin.from('usage_events').insert({
    organization_id: organizationId,
    event_type: eventType,
    tokens_or_credits_used: amount,
    cost_estimate: costEstimate,
    detail: detail ?? null,
  });
  if (error) {
    // Metering must never silently vanish, but also must not break generation.
    console.error(`[usage] failed to record ${eventType} for org ${organizationId}: ${error.message}`);
  }
}
