// ============================================================================
// Higgsfield client (private to the generation adapter).
// ----------------------------------------------------------------------------
// Higgsfield's API is sparsely documented and gated (per CLAUDE.md), so this
// client is built to the documented v2 shape but keeps every endpoint and the
// auth scheme configurable via env, parses responses defensively, and polls
// async jobs with exponential backoff + a hard timeout. All failures surface as
// typed errors so the caller (and Module 6 orchestrator) can decide to retry.
//
//   Auth:   Authorization: Key <KEY_ID>:<SECRET>
//   Submit: POST <base><path>           -> { id }  (job set)
//   Poll:   GET  <base>/v1/job-sets/{id} -> { jobs: [{ status, results }] }
// Override any of these via HIGGSFIELD_* env vars if the live API differs.
// ============================================================================

const BASE = (process.env.HIGGSFIELD_API_URL ?? 'https://platform.higgsfield.ai').replace(/\/+$/, '');
const IMAGE_PATH = process.env.HIGGSFIELD_IMAGE_PATH ?? '/v1/text2image/soul';
const VIDEO_PATH = process.env.HIGGSFIELD_VIDEO_PATH ?? '/v1/image2video/dop';
const STATUS_PATH = process.env.HIGGSFIELD_STATUS_PATH ?? '/v1/job-sets'; // + /{id}

export type HiggsfieldResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type JobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'unknown';

export interface JobHandle {
  id: string;
}

export interface JobResult {
  status: JobStatus;
  url?: string;
  raw: unknown;
}

function authHeaders(): HiggsfieldResult<Record<string, string>> {
  const keyId = process.env.HIGGSFIELD_KEY_ID;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  if (!keyId || !secret) {
    return { ok: false, error: 'HIGGSFIELD_KEY_ID / HIGGSFIELD_API_SECRET not set' };
  }
  return {
    ok: true,
    data: {
      Authorization: `Key ${keyId}:${secret}`,
      'Content-Type': 'application/json',
      // Some gated endpoints reject non-browser UAs; mirror the SDK's UA.
      'User-Agent': 'higgsfield-server-js/2.0',
    },
  };
}

async function submit(path: string, params: Record<string, unknown>): Promise<HiggsfieldResult<JobHandle>> {
  const headers = authHeaders();
  if (!headers.ok) return headers;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: headers.data,
      // Higgsfield expects the inputs wrapped in a top-level `params` object.
      body: JSON.stringify({ params }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Higgsfield ${path} responded ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = safeJson(text);
    const id = extractJobId(body);
    if (!id) return { ok: false, error: `Higgsfield ${path}: could not find a job id in response` };
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: `Higgsfield ${path} request failed: ${(err as Error).message}` };
  }
}

// Two image-model families share /v1/text2image/<model>, with different inputs:
//   • Soul (text-to-image):  { prompt, width_and_height, quality, batch_size }
//   • Nano Banana (img-edit): { prompt, input_images:[{type:'image_url',image_url}], aspect_ratio }
// Discovered empirically (see scripts/probe-higgsfield.ts). Mode follows
// HIGGSFIELD_IMAGE_MODE, else inferred from the configured path.
const IMAGE_MODE = process.env.HIGGSFIELD_IMAGE_MODE ?? (IMAGE_PATH.includes('nano-banana') ? 'edit' : 'soul');

export function submitImageJob(params: {
  prompt: string;
  width_and_height?: string;
  quality?: string;
  batch_size?: number;
  style_id?: string;
  inputImageUrl?: string; // required by image-edit models (Nano Banana)
  aspectRatio?: string;
}): Promise<HiggsfieldResult<JobHandle>> {
  if (IMAGE_MODE === 'edit') {
    return submit(IMAGE_PATH, {
      prompt: params.prompt,
      input_images: params.inputImageUrl
        ? [{ type: 'image_url', image_url: params.inputImageUrl }]
        : [],
      aspect_ratio: params.aspectRatio ?? '9:16',
    });
  }
  return submit(IMAGE_PATH, {
    width_and_height: '1536x1536',
    quality: '1080p',
    batch_size: 1,
    prompt: params.prompt,
    ...(params.style_id ? { style_id: params.style_id } : {}),
  });
}

export function submitVideoJob(params: {
  prompt?: string;
  input_images?: string[]; // image-to-video requires at least one source image
  duration?: number;
  soundtrack?: string;
}): Promise<HiggsfieldResult<JobHandle>> {
  return submit(VIDEO_PATH, { duration: 5, ...params });
}

/** One status read for a job set. */
export async function pollJobStatus(jobId: string): Promise<HiggsfieldResult<JobResult>> {
  const headers = authHeaders();
  if (!headers.ok) return headers;
  try {
    const res = await fetch(`${BASE}${STATUS_PATH}/${jobId}`, { headers: headers.data });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Higgsfield status ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = safeJson(text);
    return { ok: true, data: { status: extractStatus(body), url: extractUrl(body), raw: body } };
  } catch (err) {
    return { ok: false, error: `Higgsfield status request failed: ${(err as Error).message}` };
  }
}

/**
 * Poll until the job completes, fails, or we time out. Exponential backoff
 * (2s → ×1.5, capped at 15s). Default timeout 180s.
 */
export async function getJobResult(
  jobId: string,
  opts: { timeoutMs?: number } = {},
): Promise<HiggsfieldResult<JobResult>> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const deadline = Date.now() + timeoutMs;
  let delay = 2_000;

  while (Date.now() < deadline) {
    const poll = await pollJobStatus(jobId);
    if (!poll.ok) return poll;
    const { status, url } = poll.data;
    if (status === 'completed') {
      if (!url) return { ok: false, error: 'Higgsfield job completed but no result URL was found' };
      return poll;
    }
    if (status === 'failed' || status === 'nsfw') {
      return { ok: false, error: `Higgsfield job ${status}` };
    }
    await sleep(Math.min(delay, deadline - Date.now()));
    delay = Math.min(delay * 1.5, 15_000);
  }
  return { ok: false, error: `Higgsfield job timed out after ${timeoutMs}ms` };
}

// --- defensive parsing helpers (the live shape may vary) --------------------
function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

function extractJobId(body: unknown): string | undefined {
  const b = body as Record<string, unknown> | undefined;
  return (
    (b?.id as string) ??
    (b?.job_set_id as string) ??
    ((b?.job_set as Record<string, unknown>)?.id as string) ??
    (Array.isArray(b?.jobs) ? ((b!.jobs as Record<string, unknown>[])[0]?.id as string) : undefined)
  );
}

function firstJob(body: unknown): Record<string, unknown> | undefined {
  const b = body as Record<string, unknown> | undefined;
  if (Array.isArray(b?.jobs)) return (b!.jobs as Record<string, unknown>[])[0];
  return b;
}

function extractStatus(body: unknown): JobStatus {
  const job = firstJob(body);
  const s = String((job?.status as string) ?? (body as Record<string, unknown>)?.status ?? '').toLowerCase();
  if (['queued', 'in_progress', 'completed', 'failed', 'nsfw'].includes(s)) return s as JobStatus;
  if (s === 'in-progress' || s === 'processing') return 'in_progress';
  return 'unknown';
}

function extractUrl(body: unknown): string | undefined {
  const job = firstJob(body);
  const results = job?.results as Record<string, unknown> | undefined;
  const raw = results?.raw as Record<string, unknown> | undefined;
  const min = results?.min as Record<string, unknown> | undefined;
  return (
    (raw?.url as string) ??
    (min?.url as string) ??
    (job?.output_url as string) ??
    (job?.url as string)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}
