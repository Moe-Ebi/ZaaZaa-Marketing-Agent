// ============================================================================
// Blotato client (private to the publishing adapter).
// ----------------------------------------------------------------------------
// Wraps the Blotato publishing API. Pulls the platform-level API key from env
// (PUBLISHING_WRAPPER_API_KEY) and posts to a connected social account. Media is
// passed as a public URL — Blotato fetches it, no upload step. Returns a typed
// result; failures (auth, network, platform) never throw to the caller.
//
//   POST https://backend.blotato.com/v2/posts
//   header: blotato-api-key: <key>
//   body:   { post: { accountId, content:{text,mediaUrls,platform}, target:{...} }, scheduledTime? }
//   resp:   201 { postSubmissionId }
// ============================================================================

const BASE = (process.env.BLOTATO_API_URL ?? 'https://backend.blotato.com').replace(/\/+$/, '');

export type BlotatoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type BlotatoPlatform = 'instagram' | 'tiktok' | 'facebook';

// Platform-specific target fields (per Blotato's required-field rules).
export interface PlatformTarget {
  targetType: BlotatoPlatform;
  pageId?: string; // facebook (required)
  // tiktok required flags:
  privacyLevel?: string;
  disabledComments?: boolean;
  disabledDuet?: boolean;
  disabledStitch?: boolean;
  isBrandedContent?: boolean;
  isYourBrand?: boolean;
  isAiGenerated?: boolean;
}

export interface PublishParams {
  accountId: string;
  text: string;
  mediaUrls: string[];
  target: PlatformTarget;
  scheduledTime?: string; // ISO; omit to publish immediately
}

export interface PublishResponse {
  postSubmissionId: string;
}

function apiKey(): BlotatoResult<string> {
  const key = process.env.PUBLISHING_WRAPPER_API_KEY;
  if (!key) return { ok: false, error: 'PUBLISHING_WRAPPER_API_KEY is not set' };
  return { ok: true, data: key };
}

export async function publishPost(params: PublishParams): Promise<BlotatoResult<PublishResponse>> {
  const key = apiKey();
  if (!key.ok) return key;

  const body: Record<string, unknown> = {
    post: {
      accountId: params.accountId,
      content: {
        text: params.text,
        mediaUrls: params.mediaUrls,
        platform: params.target.targetType,
      },
      target: params.target,
    },
  };
  if (params.scheduledTime) body.scheduledTime = params.scheduledTime;

  try {
    const res = await fetch(`${BASE}/v2/posts`, {
      method: 'POST',
      headers: { 'blotato-api-key': key.data, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Blotato ${res.status}: ${text.slice(0, 300)}` };
    }
    const parsed = (() => { try { return JSON.parse(text); } catch { return {}; } })() as {
      postSubmissionId?: string;
      id?: string;
    };
    const id = parsed.postSubmissionId ?? parsed.id;
    if (!id) return { ok: false, error: 'Blotato: no postSubmissionId in response' };
    return { ok: true, data: { postSubmissionId: id } };
  } catch (err) {
    return { ok: false, error: `Blotato request failed: ${(err as Error).message}` };
  }
}
