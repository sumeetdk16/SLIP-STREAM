/**
 * Slipstream — Groq client (service-worker side).
 *
 * Every network call lives here so the content scripts never touch the API key.
 * Free-tier Groq is fast enough that we can summarise a whole thread inline,
 * but it is also aggressively rate limited, so callers get a typed error they
 * can render instead of a raw fetch rejection.
 */
(function (root) {
  'use strict';

  const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
  const DEFAULT_MODEL = 'openai/gpt-oss-120b';

  // Groq retires model ids without warning, and a stale one comes back as a 404
  // that reads like a broken key. The real list is fetched from /models at
  // runtime (see listModels); this is only the seed for a first paint and the
  // fallback for an offline or keyless page.
  const FALLBACK_MODELS = [
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B' },
    { id: 'groq/compound-mini', name: 'Compound Mini' }
  ];

  function normalizeModel(model) {
    return typeof model === 'string' && model ? model : DEFAULT_MODEL;
  }

  /**
   * The chat-capable models this key can actually reach, newest-largest first.
   * Groq's catalogue also holds speech, transcription and classifier models;
   * they answer /models but not a chat completion, so they are filtered out by
   * modality rather than by a name blocklist that would rot the same way.
   */
  function isChatModel(m) {
    return (
      m?.active &&
      (m.input_modalities || []).includes('text') &&
      JSON.stringify(m.output_modalities || []) === JSON.stringify(['text']) &&
      (m.context_length || 0) >= 32768 &&
      !String(m.id).includes('guard')
    );
  }

  async function listModels(apiKey) {
    if (!apiKey) throw new GroqError('No Groq API key set.', 'no_key');
    let res;
    try {
      res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
    } catch (err) {
      throw new GroqError('Could not reach Groq.', 'network');
    }
    if (res.status === 401) throw new GroqError('Groq rejected the API key.', 'bad_key');
    if (!res.ok) throw new GroqError(`Groq error ${res.status}.`, 'http_' + res.status);
    const json = await res.json();
    const models = (json?.data || [])
      .filter(isChatModel)
      .map((m) => ({ id: m.id, name: m.name || m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return models.length ? models : FALLBACK_MODELS.slice();
  }
  const TIMEOUT_MS = 25000;

  class GroqError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'GroqError';
      this.code = code || 'unknown';
    }
  }

  async function chat(opts) {
    try {
      return await once(opts);
    } catch (err) {
      // A model retired since the setting was saved 404s as model_not_found.
      // One retry on the default turns a dead-end error into a working handoff;
      // the options page repairs the stored setting next time it opens.
      const retired = err?.code === 'http_404' && /model_not_found|does not exist/.test(err.message);
      if (retired && normalizeModel(opts.model) !== DEFAULT_MODEL) {
        return await once({ ...opts, model: DEFAULT_MODEL });
      }
      throw err;
    }
  }

  async function once({ apiKey, model, system, user, temperature = 0.3, maxTokens = 900 }) {
    if (!apiKey) throw new GroqError('No Groq API key set.', 'no_key');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: normalizeModel(model),
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        })
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new GroqError('Groq timed out.', 'timeout');
      throw new GroqError('Could not reach Groq.', 'network');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) throw new GroqError('Groq rejected the API key.', 'bad_key');
    if (res.status === 429) throw new GroqError('Groq rate limit hit — try again shortly.', 'rate_limited');
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new GroqError(`Groq error ${res.status}. ${detail.slice(0, 160)}`, 'http_' + res.status);
    }

    const json = await res.json();
    const choice = json?.choices?.[0];
    const text = choice?.message?.content;
    if (!text) {
      // The GPT-OSS models reason before they speak, and that reasoning is
      // billed against max_tokens. Too small a budget returns finish_reason
      // 'length' with an empty content string, which is a budget problem
      // wearing the costume of a broken model.
      if (choice?.finish_reason === 'length') {
        throw new GroqError('Groq ran out of token budget before replying.', 'truncated');
      }
      throw new GroqError('Groq returned an empty response.', 'empty');
    }
    return text.trim();
  }

  async function verifyKey(apiKey, model) {
    await chat({
      apiKey,
      model,
      system: 'Reply with the single word OK.',
      user: 'ping',
      // Reasoning models spend ~55 tokens thinking before the first content
      // token, so a tight budget here fails a perfectly good key.
      maxTokens: 256,
      temperature: 0
    });
    return true;
  }

  root.SlipstreamGroq = { chat, verifyKey, listModels, GroqError, DEFAULT_MODEL, FALLBACK_MODELS, normalizeModel };
})(typeof self !== 'undefined' ? self : globalThis);
