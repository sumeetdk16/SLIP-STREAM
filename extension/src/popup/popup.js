/**
 * Slipstream — browser-action popup.
 *
 * A thin view over the service worker: it never reads storage directly so the
 * key stays out of this document entirely.
 */
/* global SLIPSTREAM_PLATFORM_LIST, slipstreamPlatformForUrl */
(function () {
  'use strict';

  const MARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2 17h20" stroke="#333842" stroke-width="2.4" stroke-linecap="butt"/>
    <path d="M2 17h4.6l7-10H22" stroke="#ffd400" stroke-width="3.4" stroke-linecap="butt" stroke-linejoin="miter"/></svg>`;

  const CARET = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`;

  const $ = (id) => document.getElementById(id);

  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res?.ok) return reject(new Error(res?.error || 'Request failed'));
        resolve(res.data);
      });
    });
  }

  function timeAgo(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  let currentPlatform = null;

  function renderContexts(contexts) {
    const wrap = $('contexts');
    $('ctx-count').textContent = contexts.length ? String(contexts.length) : '';
    wrap.replaceChildren();

    if (!contexts.length) {
      wrap.append(
        Object.assign(document.createElement('div'), {
          className: 'empty',
          textContent: 'Open a chat on ChatGPT, Claude, Gemini, Copilot or Grok. Slipstream saves the thread here, ready to move.'
        })
      );
      return;
    }

    for (const ctx of contexts) {
      const source = SLIPSTREAM_PLATFORM_LIST.find((p) => p.id === ctx.platform);
      const card = document.createElement('div');
      card.className = 'ctx';

      const head = document.createElement('button');
      head.className = 'ctx-head';
      head.setAttribute('aria-expanded', 'false');
      head.innerHTML = `
        <span class="bar" style="background:${source?.color || '#6a7280'}"></span>
        <span class="info">
          <span class="t"></span>
          <span class="m"></span>
        </span>
        <span class="caret">${CARET}</span>`;
      head.querySelector('.t').textContent = ctx.title || 'Untitled thread';
      head.querySelector('.m').textContent =
        `${source?.name || ctx.platform} · ${ctx.messageCount} msg · ${timeAgo(ctx.capturedAt)}`;
      head.addEventListener('click', () => {
        const open = card.classList.toggle('open');
        head.setAttribute('aria-expanded', String(open));
      });

      const targets = document.createElement('div');
      targets.className = 'ctx-targets';
      for (const target of SLIPSTREAM_PLATFORM_LIST.filter((p) => p.id !== ctx.platform)) {
        const btn = document.createElement('button');
        btn.className = 'tbtn';
        btn.style.setProperty('--line', target.color);
        btn.innerHTML = '<span></span>';
        btn.querySelector('span:last-child').textContent = target.name;
        btn.addEventListener('click', async () => {
          const label = btn.querySelector('span:last-child');
          targets.querySelectorAll('button').forEach((b) => (b.disabled = true));
          label.textContent = 'Sending…';
          try {
            await send('SEND_HANDOFF', { contextId: ctx.id, targetPlatformId: target.id });
            window.close();
          } catch (err) {
            label.textContent = target.name;
            targets.querySelectorAll('button').forEach((b) => (b.disabled = false));
            setHint(err.message, true);
          }
        });
        targets.appendChild(btn);
      }

      card.append(head, targets);
      wrap.appendChild(card);
    }
  }

  function setHint(text, isError = false) {
    const el = $('hint');
    el.textContent = text || '';
    el.className = 'status' + (isError ? ' err' : '');
  }

  function bindToggle(id, settings) {
    const input = $(id);
    input.checked = settings[id] !== false;
    input.addEventListener('change', async () => {
      try {
        await send('SET_SETTINGS', { patch: { [id]: input.checked } });
      } catch (err) {
        input.checked = !input.checked;
        setHint(err.message, true);
      }
    });
  }

  async function init() {
    $('mark').innerHTML = MARK;
    $('version').textContent = 'v' + chrome.runtime.getManifest().version;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentPlatform = tab?.url ? slipstreamPlatformForUrl(tab.url) : null;

    const pill = $('platform-pill');
    if (currentPlatform) {
      pill.classList.add('ok');
      pill.querySelector('.bar').style.background = currentPlatform.color;
      $('platform-name').textContent = currentPlatform.name;
    } else {
      $('platform-name').textContent = 'Not on a supported site';
    }

    const { settings, contexts } = await send('GET_STATE');

    const keyPill = $('key-pill');
    if (settings.groqApiKey) {
      keyPill.classList.add('ok');
      $('key-text').textContent = 'Groq connected';
    } else {
      $('key-text').textContent = 'No Groq key';
      setHint('Add a free Groq key in Settings for compressed briefs and the prompt enhancer.');
    }

    ['widgetEnabled', 'autoCapture', 'limitAlerts'].forEach((id) => bindToggle(id, settings));
    renderContexts(contexts);

    $('open-options').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    $('clear').addEventListener('click', async () => {
      await send('CLEAR_CONTEXTS');
      renderContexts([]);
      setHint('Every saved thread deleted.');
    });
  }

  init().catch((err) => setHint(err.message, true));
})();
