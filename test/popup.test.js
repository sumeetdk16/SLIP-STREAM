import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { ext, readSource } from './helpers.js';

/**
 * Mounts the real popup document with a stubbed service worker behind it, so
 * these tests exercise the markup the popup actually ships rather than a copy.
 */
function mountPopup({ contexts = [], settings = {}, url = 'https://claude.ai/chat/1' } = {}) {
  const html = fs.readFileSync(path.join(ext, 'src/popup/popup.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  const sent = [];
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: '1.0.0' }),
      openOptionsPage: () => {},
      lastError: null,
      sendMessage(msg, cb) {
        sent.push(msg);
        const data =
          msg.type === 'GET_STATE'
            ? { settings: { widgetEnabled: true, autoCapture: true, limitAlerts: true, ...settings }, contexts }
            : {};
        cb({ ok: true, data });
      }
    },
    tabs: { query: async () => [{ url }] }
  };
  window.close = () => {};

  window.eval(readSource('src/shared/platforms.js'));
  window.eval(readSource('src/shared/logos.js'));
  window.eval(readSource('src/popup/popup.js'));
  return { window, doc: window.document, sent };
}

const thread = (over = {}) => ({
  id: 'c1',
  platform: 'claude',
  title: 'Rate limiting the upload endpoint',
  messageCount: 12,
  capturedAt: Date.now() - 2 * 60 * 60 * 1000,
  ...over
});

const settle = () => new Promise((r) => setTimeout(r, 0));

test('a saved thread carries its assistant mark, its length and a gauge', async () => {
  const { doc, window } = mountPopup({ contexts: [thread()] });
  await settle();

  const row = doc.querySelector('.ctx');
  assert.ok(row, 'no saved thread rendered');
  // The line is named by the product's own mark, drawn in currentColor so it
  // takes the grey of whatever row it sits in.
  const mark = row.querySelector('.logo svg path');
  assert.ok(mark, 'no mark drawn for the saved thread');
  assert.equal(mark.getAttribute('d'), window.SLIPSTREAM_LOGO_PATHS.claude);
  assert.match(row.querySelector('.m').textContent, /^Claude · 12 turns$/);
  assert.equal(row.querySelector('.age').textContent, '2h ago');

  // Gold measures: 12 of a comfortable 30 turns.
  const fill = row.querySelector('.gauge i').style.transform;
  assert.equal(fill, 'scaleX(0.4)');
});

test('one turn is not pluralised, and a long thread pegs the gauge at full', async () => {
  const { doc } = mountPopup({ contexts: [thread({ messageCount: 1 }), thread({ id: 'c2', messageCount: 90 })] });
  await settle();

  const [first, second] = doc.querySelectorAll('.ctx');
  assert.match(first.querySelector('.m').textContent, /1 turn$/);
  assert.equal(second.querySelector('.gauge i').style.transform, 'scaleX(1)');
});

test('every destination but the thread’s own line is offered, each a station', async () => {
  const { doc, window } = mountPopup({ contexts: [thread()] });
  await settle();

  const targets = [...doc.querySelectorAll('.tbtn')];
  const names = targets.map((b) => b.querySelector('.tname').textContent);
  assert.equal(names.length, window.SLIPSTREAM_PLATFORM_LIST.length - 1);
  assert.ok(!names.includes('Claude'), 'must not offer the line the thread is already on');

  for (const [i, btn] of targets.entries()) {
    // Each destination is a station on the trunk: its own line colour, its own
    // arrival slot in the stagger, and the departure arrow the widget draws.
    assert.ok(btn.querySelector('.logo svg path'), `${names[i]} has no mark`);
    assert.equal(btn.style.getPropertyValue('--i'), String(i));
    assert.ok(btn.querySelector('.go svg'), `${names[i]} has no departure arrow`);
  }
});

test('picking a destination hands off once and says so on the button', async () => {
  const { doc, sent } = mountPopup({ contexts: [thread()] });
  await settle();

  const btn = doc.querySelector('.tbtn');
  const name = btn.querySelector('.tname').textContent;
  btn.dispatchEvent(new doc.defaultView.Event('click'));

  assert.equal(btn.querySelector('.tname').textContent, 'Carrying…');
  assert.ok([...doc.querySelectorAll('.tbtn')].every((b) => b.disabled), 'the rest of the map must lock');
  await settle();

  const handoffs = sent.filter((m) => m.type === 'SEND_HANDOFF');
  assert.equal(handoffs.length, 1, `expected one handoff to ${name}`);
  assert.equal(handoffs[0].payload.contextId, 'c1');
});

test('with nothing saved the popup explains what to do instead of showing an empty map', async () => {
  const { doc } = mountPopup({ contexts: [] });
  await settle();

  assert.equal(doc.querySelector('.ctx'), null);
  assert.match(doc.querySelector('.empty').textContent, /Open a chat/);
});
