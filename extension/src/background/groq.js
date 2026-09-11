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
  const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
  const TIMEOUT_MS = 25000;

  class GroqError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'GroqError';
      this.code = code || 'unknown';
    }
  }

  async function chat({ apiKey, model, system, user, temperature = 0.3, maxTokens = 900 }) {
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
          model: model || DEFAULT_MODEL,
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
    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new GroqError('Groq returned an empty response.', 'empty');
    return text.trim();
  }

  async function verifyKey(apiKey) {
    await chat({
      apiKey,
      system: 'Reply with the single word OK.',
      user: 'ping',
      maxTokens: 5,
      temperature: 0
    });
    return true;
  }

  root.SlipstreamGroq = { chat, verifyKey, GroqError, DEFAULT_MODEL };
})(typeof self !== 'undefined' ? self : globalThis);
