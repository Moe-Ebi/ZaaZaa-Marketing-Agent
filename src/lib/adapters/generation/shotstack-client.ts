// ============================================================================
// Shotstack client (private to the generation adapter).
// ----------------------------------------------------------------------------
// Submits a render and polls it to completion. Base URL comes from
// SHOTSTACK_API_URL (the provided value points at .../render; we derive the base
// by stripping that). Auth via x-api-key. Returns typed results.
// ============================================================================

const RENDER_URL = process.env.SHOTSTACK_API_URL ?? 'https://api.shotstack.io/edit/v1/render';
const BASE = RENDER_URL.replace(/\/render\/?$/, '');

export type ShotstackResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ShotstackTimeline {
  soundtrack?: { src: string; effect?: string };
  background?: string;
  tracks: { clips: unknown[] }[];
}

export interface ShotstackOutput {
  format: 'mp4';
  size: { width: number; height: number };
}

function apiKey(): ShotstackResult<string> {
  const key = process.env.SHOTSTACK_API_KEY;
  if (!key) return { ok: false, error: 'SHOTSTACK_API_KEY is not set' };
  return { ok: true, data: key };
}

export async function submitRender(
  timeline: ShotstackTimeline,
  output: ShotstackOutput,
): Promise<ShotstackResult<{ id: string }>> {
  const key = apiKey();
  if (!key.ok) return key;
  try {
    const res = await fetch(`${BASE}/render`, {
      method: 'POST',
      headers: { 'x-api-key': key.data, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeline, output }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Shotstack render ${res.status}: ${text.slice(0, 200)}` };
    const body = JSON.parse(text) as { response?: { id?: string } };
    const id = body.response?.id;
    if (!id) return { ok: false, error: 'Shotstack render: no id returned' };
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: `Shotstack render request failed: ${(err as Error).message}` };
  }
}

export interface RenderStatus {
  status: string; // queued | fetching | rendering | saving | done | failed
  url?: string;
}

export async function pollRenderStatus(id: string): Promise<ShotstackResult<RenderStatus>> {
  const key = apiKey();
  if (!key.ok) return key;
  try {
    const res = await fetch(`${BASE}/render/${id}`, { headers: { 'x-api-key': key.data } });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Shotstack status ${res.status}: ${text.slice(0, 200)}` };
    const body = JSON.parse(text) as { response?: { status?: string; url?: string } };
    return { ok: true, data: { status: body.response?.status ?? 'unknown', url: body.response?.url } };
  } catch (err) {
    return { ok: false, error: `Shotstack status request failed: ${(err as Error).message}` };
  }
}

/** Poll until done/failed/timeout with exponential backoff. */
export async function waitForRender(
  id: string,
  opts: { timeoutMs?: number } = {},
): Promise<ShotstackResult<RenderStatus>> {
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const deadline = Date.now() + timeoutMs;
  let delay = 3_000;
  while (Date.now() < deadline) {
    const poll = await pollRenderStatus(id);
    if (!poll.ok) return poll;
    if (poll.data.status === 'done') {
      if (!poll.data.url) return { ok: false, error: 'Shotstack render done but no URL' };
      return poll;
    }
    if (poll.data.status === 'failed') return { ok: false, error: 'Shotstack render failed' };
    await new Promise((r) => setTimeout(r, Math.min(delay, deadline - Date.now())));
    delay = Math.min(delay * 1.5, 15_000);
  }
  return { ok: false, error: `Shotstack render timed out after ${timeoutMs}ms` };
}
