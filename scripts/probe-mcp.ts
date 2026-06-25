import './load-env';

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const KEY = process.env.ANTHROPIC_API_KEY!;
const MCP_URL = 'https://mcp.higgsfield.ai/mcp';
const TOKEN = `${process.env.HIGGSFIELD_KEY_ID}:${process.env.HIGGSFIELD_API_SECRET}`;

async function main() {
  const res = await fetch(ANTHROPIC, {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'mcp-client-2025-04-04',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content:
          'Use the higgsfield_generate_image tool with model "nano_banana_pro" to generate ONE image. ' +
          'Prompt: "Premium lifestyle product shot of blue and silver athletic shoes on a sunlit urban street, cinematic". ' +
          'aspect_ratio "9:16". After it completes, reply with ONLY the final image URL.',
      }],
      mcp_servers: [{ type: 'url', url: MCP_URL, name: 'higgsfield', authorization_token: TOKEN }],
    }),
  });
  const text = await res.text();
  console.log('HTTP', res.status);
  const j = JSON.parse(text);
  if (j.error) { console.log('ERROR', JSON.stringify(j.error)); return; }
  for (const b of j.content ?? []) {
    if (b.type === 'text') console.log('TEXT:', b.text.slice(0, 500));
    else if (b.type === 'mcp_tool_use') console.log('TOOL_USE:', b.name, JSON.stringify(b.input).slice(0, 200));
    else if (b.type === 'mcp_tool_result') console.log('TOOL_RESULT (is_error=' + b.is_error + '):', JSON.stringify(b.content).slice(0, 600));
    else console.log('BLOCK:', b.type);
  }
  console.log('stop_reason:', j.stop_reason);
}
main();
