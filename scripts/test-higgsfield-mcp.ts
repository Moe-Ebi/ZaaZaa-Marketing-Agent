// ============================================================================
// Higgsfield MCP integration test.
// ----------------------------------------------------------------------------
// Generation runs via the Anthropic MCP connector against mcp.higgsfield.ai,
// drawing on the Plus-plan quota (NOT the developer REST API). This requires
// HIGGSFIELD_MCP_TOKEN (an OAuth token for the MCP server). When it's set, this
// asserts real image + video generation. When it's absent, the relevant checks
// are SKIPPED with an actionable message (the client must still return a typed
// result without throwing).
// ============================================================================
import './load-env';
import {
  generateImageViaMcp,
  generateVideoViaMcp,
  isMcpConfigured,
} from '../src/lib/services/higgsfield-mcp-client';

let failures = 0;
let skips = 0;
function check(label: string, ok: boolean, extra?: string) {
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}
function skip(label: string, reason: string) {
  console.log(`  ⚠ SKIP  ${label} — ${reason}`);
  skips++;
}

async function main() {
  const configured = isMcpConfigured();
  console.log(`MCP configured: ${configured} (ANTHROPIC_API_KEY + HIGGSFIELD_MCP_TOKEN)\n`);

  console.log('Image generation via Higgsfield MCP:');
  const img = await generateImageViaMcp(
    'Premium lifestyle product shot of blue and silver athletic shoes on a sunlit urban street, cinematic',
    { aspectRatio: '9:16' },
  );
  check('client returns a typed result (no throw)', typeof img.ok === 'boolean');
  if (configured) {
    check('image generated via MCP', img.ok && !!img.url, img.ok ? img.url : img.error);
  } else {
    skip('image generated via MCP', `needs HIGGSFIELD_MCP_TOKEN — client said: ${img.error}`);
  }

  console.log('\nVideo generation via Higgsfield MCP:');
  const vid = await generateVideoViaMcp(
    'Cinematic lifestyle reel: a model walking confidently in blue and silver sneakers on a sunlit street',
    { durationSeconds: 5 },
  );
  check('client returns a typed result (no throw)', typeof vid.ok === 'boolean');
  if (configured) {
    check('video generated via MCP', vid.ok && !!vid.url, vid.ok ? vid.url : vid.error);
  } else {
    skip('video generated via MCP', `needs HIGGSFIELD_MCP_TOKEN — client said: ${vid.error}`);
  }

  console.log(`\n${failures === 0 ? '✓ HIGGSFIELD MCP CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}${skips ? ` (${skips} skipped)` : ''}`);
  if (skips > 0) {
    console.log('\nTo enable live MCP generation, set HIGGSFIELD_MCP_TOKEN in .env.local:');
    console.log('  • It is an OAuth access token for https://mcp.higgsfield.ai/mcp (the same');
    console.log('    connection Claude.ai uses). The REST key (KEY_ID:SECRET) is NOT valid here');
    console.log('    — the MCP server rejects it with "Invalid or expired token".');
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n✗ MCP test errored:\n', err.message);
  process.exit(1);
});
