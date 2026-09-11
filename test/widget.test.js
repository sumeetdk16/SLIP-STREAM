import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScripts } from './helpers.js';

function mountWidget({ handlers = {} } = {}) {
  const window = loadContentScripts('<main><div id="prompt-textarea" contenteditable="true"></div></main>', {
    scripts: ['src/content/widget.js']
  });
  // The widget persists its dragged position; the tests only need it not to throw.
  window.chrome = { storage: { local: { get: (_k, cb) => cb({}), set: () => {} } } };

  const api = window.SlipstreamWidget.create({
    platform: window.SLIPSTREAM_PLATFORMS.chatgpt,
    readComposer: () => 'typed by hand',
    writeComposer: () => {},
    ...handlers
  });
  const shadow = window.document.getElementById('slipstream-root').shadowRoot;
  return { window, api, shadow };
}

const capture = (n = 3) => ({
  platform: 'chatgpt',
  title: 'Rate limiting the upload endpoint',
  messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'turn ' + i })),
  degraded: false
});

test('the widget mounts into a shadow root, closed to the host page CSS', () => {
  const { window, shadow } = mountWidget();
  assert.ok(shadow, 'no shadow root');
  assert.ok(shadow.querySelector('.launcher'), 'no launcher');
  // Nothing of the widget should be reachable from the page's own document.
  assert.equal(window.document.querySelector('.launcher'), null);
});

test('the panel opens with one destination per other platform', () => {
  const { window, api, shadow } = mountWidget();
  api.show();
  api.setCapture(capture());

  const targets = [...shadow.querySelectorAll('.target')];
  assert.equal(targets.length, window.SLIPSTREAM_PLATFORM_LIST.length - 1);
  assert.ok(!targets.some((b) => b.textContent.includes('ChatGPT')), 'must not offer the current platform');
  assert.ok(targets.every((b) => !b.disabled), 'destinations should be live once a thread is captured');
});

test('destinations stay disabled until something is captured', () => {
  const { api, shadow } = mountWidget();
  api.show();
  assert.ok([...shadow.querySelectorAll('.target')].every((b) => b.disabled));
});

test('re-rendering does not disturb a prompt being typed', () => {
  const { api, shadow } = mountWidget();
  api.show();
  const box = shadow.querySelector('textarea');
  box.value = 'half-written prompt';
  box.focus();

  // An auto-capture tick lands mid-sentence.
  api.setCapture(capture(9));
  api.setContexts([{ id: 'a', platform: 'claude', title: 'Other thread', capturedAt: Date.now(), messageCount: 4 }]);

  assert.equal(shadow.querySelector('textarea'), box, 'the textarea must be the same node');
  assert.equal(box.value, 'half-written prompt');
  assert.equal(shadow.activeElement, box, 'focus must survive the re-render');
});

test('a detected limit opens the panel and flags the launcher', () => {
  const { api, shadow } = mountWidget();
  api.setCapture(capture());
  api.showLimit({ phrase: "you've reached the current usage cap" });

  assert.ok(shadow.querySelector('.panel').classList.contains('open'), 'panel should open itself');
  assert.ok(shadow.querySelector('.banner').classList.contains('on'));
  assert.match(shadow.querySelector('.banner').textContent, /ChatGPT limit reached/);
  assert.ok(shadow.querySelector('.pip').classList.contains('on'));

  api.clearLimit();
  assert.equal(shadow.querySelector('.banner').classList.contains('on'), false);
  assert.equal(shadow.querySelector('.pip').classList.contains('on'), false);
});

test('choosing a destination hands off exactly once', async () => {
  const calls = [];
  const { api, shadow } = mountWidget({
    handlers: { onHandoff: async ({ target }) => calls.push(target.id) }
  });
  api.show();
  api.setCapture(capture());

  const claude = [...shadow.querySelectorAll('.target')].find((b) => b.textContent.includes('Claude'));
  claude.click();
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(calls, ['claude']);
  assert.match(shadow.querySelector('.toast').textContent, /Carried to Claude/);
});

test('a failed handoff surfaces the reason instead of failing silently', async () => {
  const { api, shadow } = mountWidget({
    handlers: {
      onHandoff: async () => {
        throw new Error('Groq rate limit hit — try again shortly.');
      }
    }
  });
  api.show();
  api.setCapture(capture());
  shadow.querySelector('.target').click();
  await new Promise((r) => setTimeout(r, 0));

  const toast = shadow.querySelector('.toast');
  assert.ok(toast.classList.contains('err'));
  assert.match(toast.textContent, /rate limit/);
  assert.ok([...shadow.querySelectorAll('.target')].every((b) => !b.disabled), 'buttons must be re-enabled');
});

test('a partially read thread says so rather than pretending', () => {
  const { api, shadow } = mountWidget();
  api.show();
  api.setCapture({ ...capture(), degraded: true });
  assert.match(shadow.querySelector('.thread').textContent, /partial read/);
});
