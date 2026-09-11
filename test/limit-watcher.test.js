import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScripts } from './helpers.js';

const COMPOSER = '<form><div id="prompt-textarea" contenteditable="true"></div></form>';

function setup(html) {
  const window = loadContentScripts(`<main>${html}${COMPOSER}</main>`, {
    scripts: ['src/content/limit-watcher.js']
  });
  const events = [];
  const watcher = window.SlipstreamLimitWatcher.createWatcher({
    platform: window.SLIPSTREAM_PLATFORMS.chatgpt,
    onDetect: (info) => events.push(['detect', info.phrase]),
    onClear: () => events.push(['clear'])
  });
  return { window, watcher, events };
}

test('a limit notice in a live region is detected', () => {
  const { watcher, events } = setup(
    '<div role="alert">You\'ve reached the current usage cap for GPT-5.</div>'
  );
  watcher.evaluate();
  assert.deepEqual(events, [['detect', "you've reached the current usage cap"]]);
  assert.equal(watcher.isActive(), true);
});

test('ordinary conversation never trips the watcher', () => {
  const { watcher, events } = setup(
    '<div role="status">Sending…</div><div data-message-author-role="assistant">Rate limiting caps requests per minute.</div>'
  );
  watcher.evaluate();
  assert.deepEqual(events, []);
  assert.equal(watcher.isActive(), false);
});

test('a stray notice outside the scanned regions is ignored', () => {
  const { watcher, events } = setup('<span>Message limit reached — upgrade to continue.</span>');
  // The span sits inside the same <main>, but only the composer's own block is
  // scanned, so this must NOT fire — proving the scan stays narrow.
  watcher.evaluate();
  assert.deepEqual(events, []);
});

test('detection fires once, and clears when the notice disappears', () => {
  const { window, watcher, events } = setup('<div role="alert">Message limit reached.</div>');
  watcher.evaluate();
  watcher.evaluate();
  assert.equal(events.filter((e) => e[0] === 'detect').length, 1, 'must not re-fire while active');

  window.document.querySelector('[role="alert"]').remove();
  watcher.evaluate();
  assert.deepEqual(events[events.length - 1], ['clear']);
  assert.equal(watcher.isActive(), false);
});

test('each platform only matches its own phrasing', () => {
  const window = loadContentScripts(
    `<main><div role="alert">You are out of free messages until 4pm.</div>${COMPOSER}</main>`,
    { scripts: ['src/content/limit-watcher.js'] }
  );
  const seen = [];
  for (const id of ['chatgpt', 'claude']) {
    const watcher = window.SlipstreamLimitWatcher.createWatcher({
      platform: window.SLIPSTREAM_PLATFORMS[id],
      onDetect: () => seen.push(id),
      onClear: () => {}
    });
    watcher.evaluate();
  }
  assert.deepEqual(seen, ['claude'], 'the Claude phrasing must not trip the ChatGPT watcher');
});
