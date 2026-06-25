// ============================================================================
// Higgsfield MCP client — generate images/videos on the Plus-plan quota.
// ----------------------------------------------------------------------------
// Uses the Anthropic Messages API "MCP connector" (mcp_servers) to drive the
// Higgsfield MCP server (https://mcp.higgsfield.ai/mcp). This routes generation
// through the user's Higgsfield subscription quota — NOT the developer REST API
// (which has no credits). Returns typed { ok, url, error }.
//
// AUTH: the connector needs an OAuth access token for the MCP server, supplied
// as HIGGSFIELD_MCP_TOKEN. The Higgsfield REST key (KEY_ID:SECRET) is NOT a
// valid MCP token — the MCP server rejects it with "Invalid or expired token".
// The token is obtained from Higgsfield's MCP OAuth flow (same connection used
// by Claude.ai). Without it, this returns a typed error and callers fall back.
//
// NOTE: the brief named "claude-opus-4-6"; that id does not exist. We default to
// claude-opus-4-8 (override via ANTHROPIC_MODEL).
// ============================================================================

const ANTHROPIC_URL = process.env.ANTHROPIC_API_URL ?? 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8';
const MCP_URL = process.env.HIGGSFIELD_MCP_URL ?? 'https://mcp.higgsfield.ai/mcp';

export interface McpMediaResult {
  ok: boolean;
  url?: string;
  error?: string;
}

const ASSET_URL_RE = /https?:\/\/[^\s"')\\]+\.(?:png|jpe?g|webp|gif|mp4|mov|webm)(?:\?[^\s"'`)\\]*)?/i;

interface AnthropicBlock {
  type: string;
  text?: string;
  name?: string;
  is_error?: boolean;
  content?: unknown;
}

/**
 * Run one MCP-connector turn against the Higgsfield server with an instruction
 * telling Claude exactly which tool + params to use, then extract the asset URL
 * from the tool result (or final text). Polls within a single request — the MCP
 * server resolves the job and returns the URL in its tool result.
 */
async function runMcp(instruction: string): Promise<McpMediaResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY is not set' };
  const token = process.env.HIGGSFIELD_MCP_TOKEN;
  if (!token) {
    return { ok: false, error: 'HIGGSFIELD_MCP_TOKEN is not set (OAuth token for mcp.higgsfield.ai)' };
  }

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: instruction }],
        mcp_servers: [
          { type: 'url', url: MCP_URL, name: 'higgsfield', authorization_token: token },
        ],
      }),
    });

    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Anthropic ${res.status}: ${text.slice(0, 200)}` };

    const body = JSON.parse(text) as { content?: AnthropicBlock[] };
    const blocks = body.content ?? [];

    // Surface an MCP tool error if generation failed (e.g. invalid token, quota).
    const errored = blocks.find((b) => b.type === 'mcp_tool_result' && b.is_error);
    if (errored) {
      const msg = JSON.stringify(errored.content);
      return { ok: false, error: `Higgsfield MCP error: ${msg.slice(0, 200)}` };
    }

    // Find the asset URL anywhere in the tool results or final text.
    const haystack = JSON.stringify(blocks);
    const match = haystack.match(ASSET_URL_RE);
    if (match) return { ok: true, url: match[0] };

    const finalText = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ');
    return { ok: false, error: `No asset URL in MCP response. Model said: ${finalText.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: `MCP request failed: ${(err as Error).message}` };
  }
}

/** Generate an image via Higgsfield MCP (Nano Banana Pro by default). */
export function generateImageViaMcp(
  prompt: string,
  opts: { aspectRatio?: string; model?: string } = {},
): Promise<McpMediaResult> {
  const model = opts.model ?? 'nano_banana_pro';
  const aspect = opts.aspectRatio ?? '9:16';
  return runMcp(
    `Use the higgsfield_generate_image tool with model "${model}" and aspect_ratio "${aspect}" to generate ONE image. ` +
      `Prompt: "${prompt.replace(/"/g, "'")}". Wait for it to finish, then reply with ONLY the final image URL.`,
  );
}

/** Generate a video via Higgsfield MCP (Kling 3.0 by default). */
export function generateVideoViaMcp(
  prompt: string,
  opts: { model?: string; durationSeconds?: number; aspectRatio?: string } = {},
): Promise<McpMediaResult> {
  const model = opts.model ?? 'kling3_0';
  const aspect = opts.aspectRatio ?? '9:16';
  const duration = opts.durationSeconds ?? 5;
  return runMcp(
    `Use the higgsfield_generate_video tool with model "${model}", aspect_ratio "${aspect}", duration ${duration} ` +
      `to generate ONE video. Prompt: "${prompt.replace(/"/g, "'")}". Wait for it to finish, then reply with ONLY the final video URL.`,
  );
}

export function isMcpConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.HIGGSFIELD_MCP_TOKEN);
}
