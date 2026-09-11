import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScripts } from './helpers.js';

/* ------------------------------------------------------------- fixtures */

const FIXTURES = {
  chatgpt: {
    url: 'https://chatgpt.com/c/abc123',
    html: `<main>
      <div data-message-author-role="user">How do I debounce a resize handler?</div>
      <div data-message-author-role="assistant">Wrap it in a timer<button>Copy</button></div>
      <div data-message-author-role="user">What about leading edge?</div>
      <form><div id="prompt-textarea" contenteditable="true"></div></form>
    </main>`,
    expectedKey: 'chatgpt:abc123'
  },
  claude: {
    url: 'https://claude.ai/chat/xyz-789',
    html: `<main>
      <div data-testid="user-message">Review this migration</div>
      <div class="font-claude-message">Two issues stand out<svg></svg></div>
      <fieldset><div contenteditable="true" class="ProseMirror"></div></fieldset>
    </main>`,
    expectedKey: 'claude:xyz-789'
  },
  gemini: {
    url: 'https://gemini.google.com/app/55',
    html: `<main>
      <user-query>Summarise this paper</user-query>
      <model-response>The authors argue</model-response>
      <rich-textarea><div contenteditable="true"></div></rich-textarea>
    </main>`,
    expectedKey: 'gemini:55'
  },
  copilot: {
    url: 'https://copilot.microsoft.com/chats/1',
    html: `<main>
      <div data-content="user-message">Fix my regex</div>
      <div data-content="ai-message">Escape the dot</div>
      <textarea id="userInput"></textarea>
    </main>`,
    expectedKey: 'copilot:/chats/1'
  },
  grok: {
    url: 'https://grok.com/chat/9',
    html: `<main>
      <div class="flex items-end"><div class="message-bubble">Explain rate limits</div></div>
      <div class="flex"><div class="message-bubble">They cap requests per minute</div></div>
      <form><textarea aria-label="Ask Grok"></textarea></form>
    </main>`,
    expectedKey: 'grok:/chat/9'
  }
};

/* ----------------------------------------------------------------- tests */

for (const [id, fixture] of Object.entries(FIXTURES)) {
  test(`${id}: captures the thread with roles intact`, () => {
    const window = loadContentScripts(fixture.html, { url: fixture.url });
    const capture = window.SlipstreamAdapters.capture();

    assert.equal(capture.platform, id);
    assert.equal(capture.threadKey, fixture.expectedKey);
    assert.equal(capture.degraded, false, 'selectors should match without the fallback');
    assert.ok(capture.messages.length >= 2, `expected turns, got ${capture.messages.length}`);
    assert.equal(capture.messages[0].role, 'user');
    assert.equal(capture.messages[1].role, 'assistant');
  });

  test(`${id}: finds a composer and writes into it`, () => {
    const window = loadContentScripts(fixture.html, { url: fixture.url });
    const { getComposer, writeComposer, readComposer } = window.SlipstreamAdapters;
    const composer = getComposer();
    assert.ok(composer, 'composer not found');
    writeComposer(composer, 'carried context');
    assert.equal(readComposer(composer), 'carried context');
  });
}

test('message chrome (buttons, icons) is stripped from captured text', () => {
  const window = loadContentScripts(FIXTURES.chatgpt.html, { url: FIXTURES.chatgpt.url });
  const capture = window.SlipstreamAdapters.capture();
  const assistant = capture.messages.find((m) => m.role === 'assistant');
  assert.equal(assistant.text, 'Wrap it in a timer');
});

test('a streaming duplicate of the final turn is collapsed', () => {
  const html = `<main>
    <div data-message-author-role="assistant">Partial answer</div>
    <div data-message-author-role="assistant">Partial answer</div>
  </main>`;
  const window = loadContentScripts(html);
  const capture = window.SlipstreamAdapters.capture();
  assert.equal(capture.messages.length, 1);
});

test('an unreadable thread degrades to the main column instead of failing', () => {
  const html = `<main><article>${'Some long conversation text. '.repeat(10)}</article></main>`;
  const window = loadContentScripts(html);
  const capture = window.SlipstreamAdapters.capture();
  assert.equal(capture.degraded, true);
  assert.equal(capture.messages.length, 1);
  assert.match(capture.messages[0].text, /Some long conversation text/);
});

test('an empty page yields no messages and no crash', () => {
  const window = loadContentScripts('<main></main>');
  const capture = window.SlipstreamAdapters.capture();
  assert.equal(capture.messages.length, 0);
  assert.equal(capture.degraded, false);
});

test('an unsupported host produces no capture at all', () => {
  const window = loadContentScripts('<main>hi</main>', { url: 'https://example.com/' });
  assert.equal(window.SlipstreamAdapters.capture(), null);
});

test('writing to a textarea fires the input event frameworks listen for', () => {
  const window = loadContentScripts(FIXTURES.copilot.html, { url: FIXTURES.copilot.url });
  const composer = window.SlipstreamAdapters.getComposer();
  let events = 0;
  composer.addEventListener('input', () => events++);
  window.SlipstreamAdapters.writeComposer(composer, 'hello');
  assert.equal(events, 1);
  assert.equal(composer.value, 'hello');
});
