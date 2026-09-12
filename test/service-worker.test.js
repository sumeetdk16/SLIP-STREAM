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

test('a model retired since it was saved retries on the default instead of 404-ing', async () => {
  const { send } = loadServiceWorker({
    storage: { settings: { model: 'llama-3.3-70b-versatile', groqApiKey: 'gsk_live' } }
  });
  const tried = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const model = JSON.parse(init.body).model;
    tried.push(model);
    if (model === 'llama-3.3-70b-versatile') {
      return {
        ok: false,
        status: 404,
        async text() {
          return '{"error":{"code":"model_not_found"}}';
        }
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] };
      }
    };
  };
  try {
    const res = await send('VERIFY_KEY', { apiKey: 'gsk_live', model: 'llama-3.3-70b-versatile' }, optionsSender);
    assert.equal(res.ok, true);
    assert.deepEqual(tried, ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the model list is built from Groq, with speech and classifier models filtered out', async () => {
  const { send } = loadServiceWorker({ storage: { settings: { groqApiKey: 'gsk_live' } } });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        data: [
          { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', active: true, input_modalities: ['text'], output_modalities: ['text'], context_length: 131072 },
          { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8', active: true, input_modalities: ['text', 'image'], output_modalities: ['text'], context_length: 131072 },
          { id: 'whisper-large-v3', name: 'Whisper', active: true, input_modalities: ['audio'], output_modalities: ['transcription'], context_length: 131072 },
          { id: 'canopylabs/orpheus-v1-english', name: 'Orpheus', active: true, input_modalities: ['text'], output_modalities: ['speech'], context_length: 131072 },
          { id: 'meta-llama/llama-prompt-guard-2-86m', name: 'Guard', active: true, input_modalities: ['text'], output_modalities: ['text'], context_length: 131072 },
          { id: 'retired-model', name: 'Retired', active: false, input_modalities: ['text'], output_modalities: ['text'], context_length: 131072 }
        ]
      };
    }
  });
  try {
    const res = await send('LIST_MODELS', {}, optionsSender);
    assert.deepEqual(res.data.models.map((m) => m.id), ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a reasoning scratchpad never reaches the brief', async () => {
  const { send } = loadServiceWorker({ storage: { settings: { groqApiKey: 'gsk_live' } } });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [
          { message: { content: '<think>weighing the options</think>\nCONTEXT — the real brief' }, finish_reason: 'stop' }
        ]
      };
    }
  });
  try {
    const res = await send('VERIFY_KEY', { apiKey: 'gsk_live', model: 'qwen/qwen3.6-27b' }, optionsSender);
    assert.equal(res.ok, true);
  } finally {
    globalThis.fetch = realFetch;
  }
  const { loadWorkerModule } = await import('./helpers.js');
  const groq = loadWorkerModule('src/background/groq.js').SlipstreamGroq;
  assert.equal(groq.stripReasoning('<think>noise</think>\nCONTEXT — real'), 'CONTEXT — real');
  assert.equal(groq.stripReasoning('CONTEXT — untouched'), 'CONTEXT — untouched');
  // qwen3.6 opens the tag and never closes it; the regex pair alone misses that.
  assert.equal(
    groq.stripReasoning('<think>\nrambling\n\nCONTEXT — real brief'),
    'CONTEXT — real brief'
  );
});

test('the agentic Compound models are kept out of the handoff list', async () => {
  const { send } = loadServiceWorker({ storage: { settings: { groqApiKey: 'gsk_live' } } });
  const realFetch = globalThis.fetch;
  const text = { active: true, input_modalities: ['text'], output_modalities: ['text'], context_length: 131072 };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        data: [
          { id: 'groq/compound', name: 'Compound', ...text },
          { id: 'groq/compound-mini', name: 'Compound Mini', ...text },
          { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', ...text }
        ]
      };
    }
  });
  try {
    const res = await send('LIST_MODELS', {}, optionsSender);
    assert.deepEqual(res.data.models.map((m) => m.id), ['openai/gpt-oss-120b']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a page cannot ask the worker to enumerate models', async () => {
  const { send } = loadServiceWorker({ storage: { settings: { groqApiKey: 'gsk_live' } } });
  const res = await send('LIST_MODELS', {}, pageSender);
  assert.equal(res.ok, false);
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
