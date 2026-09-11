import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkerModule } from './helpers.js';

const scope = loadWorkerModule('src/shared/platforms.js');
const { SLIPSTREAM_PLATFORMS, SLIPSTREAM_PLATFORM_LIST, slipstreamPlatformForHost, slipstreamPlatformForUrl } = scope;

test('every platform entry is complete', () => {
  for (const [id, p] of Object.entries(SLIPSTREAM_PLATFORMS)) {
    assert.equal(p.id, id, `${id} id mismatch`);
    assert.ok(p.name && p.vendor, `${id} missing name/vendor`);
    assert.match(p.color, /^#[0-9a-f]{6}$/i, `${id} colour must be hex`);
    assert.ok(p.hosts.length > 0, `${id} needs at least one host`);
    assert.ok(p.newChatUrl.startsWith('https://'), `${id} newChatUrl must be https`);
    assert.ok(Array.isArray(p.limitPatterns), `${id} needs limitPatterns`);
    for (const pattern of p.limitPatterns) {
      assert.equal(pattern, pattern.toLowerCase(), `${id}: "${pattern}" must be lowercase to match the scanner`);
    }
  }
});

test('the five headline platforms are all present', () => {
  for (const id of ['chatgpt', 'claude', 'gemini', 'copilot', 'grok']) {
    assert.ok(SLIPSTREAM_PLATFORMS[id], `missing ${id}`);
  }
  assert.ok(SLIPSTREAM_PLATFORM_LIST.length >= 5);
});

test('hosts resolve to the right platform, including subdomains', () => {
  assert.equal(slipstreamPlatformForHost('chatgpt.com').id, 'chatgpt');
  assert.equal(slipstreamPlatformForHost('chat.openai.com').id, 'chatgpt');
  assert.equal(slipstreamPlatformForHost('claude.ai').id, 'claude');
  assert.equal(slipstreamPlatformForHost('gemini.google.com').id, 'gemini');
  assert.equal(slipstreamPlatformForUrl('https://grok.com/chat/1').id, 'grok');
  assert.equal(slipstreamPlatformForUrl('https://example.com'), null);
  assert.equal(slipstreamPlatformForUrl('not a url'), null);
});

test('no two platforms claim the same host', () => {
  const seen = new Map();
  for (const p of SLIPSTREAM_PLATFORM_LIST) {
    for (const host of p.hosts) {
      assert.ok(!seen.has(host), `${host} claimed by both ${seen.get(host)} and ${p.id}`);
      seen.set(host, p.id);
    }
  }
});
