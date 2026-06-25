// ============================================================================
// Higgsfield video client (private to the generation adapter).
// ----------------------------------------------------------------------------
// image-to-video (DoP) + text-to-video, async submit + exponential-backoff
// polling. Auth: validated `Key <KEY_ID>:<SECRET>` (Bearer HIGGSFIELD_API_KEY
// honored if present). Endpoints are env-configurable; defaults are the routes
// the API recognizes (see scripts/probe-higgsfield.ts). All failures are typed
// (auth / rate_limit / timeout / nsfw / unknown) so the pipeline can fall back
// to Shotstack.
// ============================================================================

const BASE = (process.env.HIGGSFIELD_API_URL ?? 'https://platform.higgsfield.ai').replace(/\/+$/, '');
const T2V_PATH = process.env.HIGGSFIELD_T2V_PATH ?? '/v1/text2video'; // not served on this account
const I2V_PATH = process.env.HIGGSFIELD_I2V_PATH ?? '/v1/image2video/dop';
const STATUS_PATH = process.env.HIGGSFIELD_STATUS_PATH ?? '/v1/job-sets';

export type VideoErrorKind = 'auth' | 'rate_limit' | 'timeout' | 'nsfw' | 'unknown';
export type VideoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind?: VideoErrorKind };

export interface VideoJob {
  generationId: string;
  statusUrl: string;
}
export interface VideoStatus {
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'unknown';
  videoUrl?: string;
}

function authHeaders(): VideoResult<Record<string, string>> {
  const bearer = process.env.HIGGSFIELD_API_KEY;
  const keyId = process.env.HIGGSFIELD_KEY_ID;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  const common = { 'Content-Type': 'application/json', 'User-Agent': 'higgsfield-server-js/2.0' };
  if (bearer) return { ok: true, data: { ...common, Authorization: `Bearer ${bearer}` } };
  if (keyId && secret) return { ok: true, data: { ...common, Authorization: `Key ${keyId}:${secret}` } };
  return { ok: false, error: 'No Higgsfield credentials (HIGGSFIELD_API_KEY or KEY_ID/SECRET)', kind: 'auth' };
}

function classify(status: number): VideoErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  return 'unknown';
}

async function submit(path: string, params: Record<string, unknown>): Promise<VideoResult<VideoJob>> {
  const headers = authHeaders();
  if (!headers.ok) return headers;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: headers.data,
      body: JSON.stringify({ params }), // Higgsfield wraps inputs in `params`
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Higgsfield ${path} ${res.status}: ${text.slice(0, 200)}`, kind: classify(res.status) };
    const body = (() => { try { return JSON.parse(text); } catch { return {}; } })() as Record<string, unknown>;
    const id = (body.id ?? body.job_set_id ?? (body.job_set as Record<string, unknown>)?.id ?? body.request_id) as string | undefined;
    if (!id) return { ok: false, error: `Higgsfield ${path}: no generation id`, kind: 'unknown' };
    return { ok: true, data: { generationId: id, statusUrl: `${BASE}${STATUS_PATH}/${id}` } };
  } catch (err) {
    return { ok: false, error: `Higgsfield ${path} failed: ${(err as Error).message}`, kind: 'unknown' };
  }
}

export function generateTextToVideo(
  prompt: string,
  _duration = 10,
  _resolution = '720p',
): Promise<VideoResult<VideoJob>> {
  return submit(T2V_PATH, { prompt, duration: _duration, quality: _resolution });
}

export function generateImageToVideo(
  imageUrl: string,
  motionPrompt: string,
  duration = 10,
  resolution = '720p',
): Promise<VideoResult<VideoJob>> {
  return submit(I2V_PATH, {
    prompt: motionPrompt,
    input_images: [{ type: 'image_url', image_url: imageUrl }],
    duration,
    quality: resolution,
  });
}

export async function pollVideoStatus(generationId: string): Promise<VideoResult<VideoStatus>> {
  const headers = authHeaders();
  if (!headers.ok) return headers;
  try {
    const res = await fetch(`${BASE}${STATUS_PATH}/${generationId}`, { headers: headers.data });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Higgsfield status ${res.status}: ${text.slice(0, 200)}`, kind: classify(res.status) };
    const body = (() => { try { return JSON.parse(text); } catch { return {}; } })() as Record<string, unknown>;
    const job = Array.isArray(body.jobs) ? (body.jobs as Record<string, unknown>[])[0] : body;
    const raw = String((job?.status as string) ?? '').toLowerCase();
    const status: VideoStatus['status'] =
      ['queued', 'in_progress', 'completed', 'failed', 'nsfw'].includes(raw) ? (raw as VideoStatus['status'])
        : raw === 'processing' || raw === 'in-progress' ? 'in_progress' : 'unknown';
    const results = job?.results as Record<string, Record<string, string>> | undefined;
    const videoUrl = results?.raw?.url ?? results?.min?.url ?? (job?.output_url as string) ?? (job?.url as string);
    return { ok: true, data: { status, videoUrl } };
  } catch (err) {
    return { ok: false, error: `Higgsfield status failed: ${(err as Error).message}`, kind: 'unknown' };
  }
}

/** Poll a video job to completion with exponential backoff (3s → ×1.5, cap 20s). */
export async function waitForVideo(
  generationId: string,
  opts: { timeoutMs?: number } = {},
): Promise<VideoResult<{ videoUrl: string }>> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const deadline = Date.now() + timeoutMs;
  let delay = 3_000;
  while (Date.now() < deadline) {
    const poll = await pollVideoStatus(generationId);
    if (!poll.ok) return poll;
    if (poll.data.status === 'completed') {
      if (!poll.data.videoUrl) return { ok: false, error: 'Video completed but no URL', kind: 'unknown' };
      return { ok: true, data: { videoUrl: poll.data.videoUrl } };
    }
    if (poll.data.status === 'failed') return { ok: false, error: 'Higgsfield video failed', kind: 'unknown' };
    if (poll.data.status === 'nsfw') return { ok: false, error: 'Higgsfield flagged content as NSFW', kind: 'nsfw' };
    await new Promise((r) => setTimeout(r, Math.min(delay, deadline - Date.now())));
    delay = Math.min(delay * 1.5, 20_000);
  }
  return { ok: false, error: `Higgsfield video timed out after ${timeoutMs}ms`, kind: 'timeout' };
}
