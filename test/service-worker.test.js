import test from 'node:test';
import assert from 'node:assert/strict';
import { loadServiceWorker } from './helpers.js';

const EXT = 'chrome-extension://slipstream-test-id';

/** options_ui runs with open_in_tab, so Chrome gives the page a sender.tab. */
const optionsSender = {
  tab: { id: 7, url: `${EXT}/src/options/options.html` },
  url: `${EXT}/src/options/options.html`
};
const popupSender = { url: `${EXT}/src/popup/popup.html` };
const pageSender = {
  tab: { id: 3, url: 'https://grok.com/chat/abc' },
  url: 'https://grok.com/chat/abc'
};

test('the options page can read its own settings even though it runs in a tab', async () => {
  const { send } = loadServiceWorker();
  const res = await send('GET_SETTINGS', {}, optionsSender);
  assert.equal(res.ok, true);
  assert.equal(res.data.model, 'openai/gpt-oss-120b');
});

test('saving an API key from the options page writes it to storage', async () => {
  const { send, storage } = loadServiceWorker();
  const res = await send('SET_SETTINGS', { patch: { groqApiKey: 'gsk_live' } }, optionsSender);
  assert.equal(res.ok, true);
  assert.equal(storage.settings.groqApiKey, 'gsk_live');
});

test('the popup, which has no tab at all, stays privileged', async () => {
  const { send } = loadServiceWorker();
  const res = await send('SET_SETTINGS', { patch: { widgetEnabled: false } }, popupSender);
  assert.equal(res.ok, true);
  assert.equal(res.data.widgetEnabled, false);
});

test('a chat page may talk to the worker but never sees or writes the key', async () => {
  const { send, storage } = loadServiceWorker({ storage: { settings: { groqApiKey: 'gsk_secret' } } });

  const read = await send('GET_SETTINGS', {}, pageSender);
  assert.equal(read.ok, true);
  assert.equal(read.data.groqApiKey, undefined);
  assert.equal(read.data.hasGroqKey, true);

  const write = await send('SET_SETTINGS', { patch: { groqApiKey: 'stolen' } }, pageSender);
  assert.equal(write.ok, false);
  assert.match(write.error, /not writable/);
  assert.equal(storage.settings.groqApiKey, 'gsk_secret');

  const verify = await send('VERIFY_KEY', { apiKey: 'x' }, pageSender);
  assert.equal(verify.ok, false);
});

test('an unsupported page is not a sender we listen to', async () => {
  const { send } = loadServiceWorker();
  const res = await send('GET_SETTINGS', {}, { tab: { id: 9, url: 'https://example.com/' }, url: 'https://example.com/' });
  assert.equal(res.ok, false);
  assert.match(res.error, /Untrusted/);
});

test('another extension gets nothing', async () => {
  const { send } = loadServiceWorker();
  const res = await send('GET_SETTINGS', {}, { id: 'someone-else', url: `${EXT}/src/options/options.html` });
  assert.equal(res.ok, false);
  assert.match(res.error, /Untrusted/);
});

test('a model id Groq has retired is healed on read instead of 404-ing forever', async () => {
  const { send } = loadServiceWorker({
    storage: { settings: { model: 'llama-3.3-70b-versatile', groqApiKey: 'gsk_live' } }
  });
  const res = await send('GET_SETTINGS', {}, optionsSender);
  assert.equal(res.data.model, 'openai/gpt-oss-120b');
});

test('Test connection tests the model the dropdown is showing, not the default', async () => {
  const { send } = loadServiceWorker();
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push(JSON.parse(init.body).model);
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] };
      }
    };
  };
  try {
    const res = await send('VERIFY_KEY', { apiKey: 'gsk_live', model: 'qwen/qwen3.8-27b' }, optionsSender);
    assert.equal(res.ok, true);
    assert.deepEqual(seen, ['qwen/qwen3.8-27b']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a reasoning model that spends its whole budget thinking says so', async () => {
  const { send } = loadServiceWorker();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { content: '' }, finish_reason: 'length' }] };
    }
  });
  try {
    const res = await send('VERIFY_KEY', { apiKey: 'gsk_live', model: 'openai/gpt-oss-120b' }, optionsSender);
    assert.equal(res.ok, false);
    assert.match(res.error, /token budget/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
