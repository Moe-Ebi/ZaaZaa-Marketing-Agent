// ============================================================================
// Performance insights (Phase 2 flywheel prep) — STUBS.
// ----------------------------------------------------------------------------
// These will let Module 6's PLAN step bias toward winning formats/hooks by
// reading real performance from analytics_snapshots. For Phase 1 they return
// empty arrays and are NOT wired into PLAN yet (per the build plan).
// ============================================================================

export interface FormatPerformance {
  format: string;
  avgEngagementRate: number;
  postCount: number;
}

export interface HookPerformance {
  hookAngle: string;
  avgEngagementRate: number;
  postCount: number;
}

/** Top formats by engagement over the last `days`. Stub: returns []. */
export async function getTopPerformingFormats(
  _organizationId: number,
  _days = 30,
): Promise<FormatPerformance[]> {
  // Phase 2: join content_items.format ↔ analytics_snapshots, average engagement.
  return [];
}

/** Top hook angles by engagement over the last `days`. Stub: returns []. */
export async function getTopPerformingHooks(
  _organizationId: number,
  _days = 30,
): Promise<HookPerformance[]> {
  // Phase 2: join content_items.hook_angle ↔ analytics_snapshots, average engagement.
  return [];
}
