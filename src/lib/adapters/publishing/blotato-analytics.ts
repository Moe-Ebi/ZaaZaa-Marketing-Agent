// ============================================================================
// Blotato analytics client (private to the publishing adapter).
// ----------------------------------------------------------------------------
// Reads post performance from Blotato. Endpoints are env-configurable and the
// responses are parsed defensively (wrapper analytics shapes vary and lag 1-2h).
// All failures surface as typed results; never throws to the caller.
// ============================================================================

const BASE = (process.env.BLOTATO_API_URL ?? 'https://backend.blotato.com').replace(/\/+$/, '');
const ANALYTICS_PATH = process.env.BLOTATO_ANALYTICS_PATH ?? '/v2/posts'; // GET {base}{path}/{id}/analytics

export type AnalyticsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface PostMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  followers: number;
  engagementRate: number; // 0..1
}

function apiKey(): AnalyticsResult<string> {
  const key = process.env.PUBLISHING_WRAPPER_API_KEY;
  if (!key) return { ok: false, error: 'PUBLISHING_WRAPPER_API_KEY is not set' };
  return { ok: true, data: key };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseMetrics(body: unknown): PostMetrics {
  const b = (body ?? {}) as Record<string, unknown>;
  // Metrics may be nested under `analytics`, `metrics`, `stats`, or flat.
  const m = (b.analytics ?? b.metrics ?? b.stats ?? b) as Record<string, unknown>;
  const views = num(m.views ?? m.plays ?? m.video_views);
  const likes = num(m.likes ?? m.favorites);
  const comments = num(m.comments);
  const shares = num(m.shares ?? m.reposts);
  const reach = num(m.reach);
  const impressions = num(m.impressions ?? m.views);
  const followers = num(m.followers ?? m.follower_count);
  const engagementsRaw = num(m.engagement_rate ?? m.engagementRate);
  // Derive engagement rate if the API didn't supply one.
  const denom = reach || impressions || views;
  const engagementRate = engagementsRaw || (denom ? (likes + comments + shares) / denom : 0);
  return { views, likes, comments, shares, reach, impressions, followers, engagementRate };
}

/** Fetch metrics for a single Blotato post/submission id. */
export async function getPostAnalytics(postId: string): Promise<AnalyticsResult<PostMetrics>> {
  const key = apiKey();
  if (!key.ok) return key;
  try {
    const res = await fetch(`${BASE}${ANALYTICS_PATH}/${postId}/analytics`, {
      headers: { 'blotato-api-key': key.data },
    });
    const text = await res.text();
    if (res.status === 404) return { ok: false, error: 'post not found / no analytics yet' };
    if (!res.ok) return { ok: false, error: `Blotato analytics ${res.status}: ${text.slice(0, 200)}` };
    const body = (() => { try { return JSON.parse(text); } catch { return {}; } })();
    return { ok: true, data: parseMetrics(body) };
  } catch (err) {
    return { ok: false, error: `Blotato analytics request failed: ${(err as Error).message}` };
  }
}
