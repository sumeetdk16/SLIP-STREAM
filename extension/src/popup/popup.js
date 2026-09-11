/**
 * Slipstream — browser-action popup.
 *
 * A thin view over the service worker: it never reads storage directly so the
 * key stays out of this document entirely.
 */
/* global SLIPSTREAM_PLATFORM_LIST, slipstreamPlatformForUrl, slipstreamLogo */
(function () {
  'use strict';

  const MARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2 17h20" stroke="#3a3a3a" stroke-width="2.4" stroke-linecap="butt"/>
    <path d="M2 17h4.6l7-10H22" stroke="#ffffff" stroke-width="3.4" stroke-linecap="butt" stroke-linejoin="miter"/></svg>`;

  const CARET = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`;

  /** The same departure arrow the in-page widget draws on a destination. */
  const GO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M5 12h13M13 7l5 5-5 5"/></svg>`;

  /** 30 turns is where a thread stops fitting comfortably in one handoff. */
  const COMFORTABLE_TURNS = 30;

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
      // Colour names the line: the row carries its assistant's brand hue.
      if (source) card.style.setProperty('--tint', source.color);

      const head = document.createElement('button');
      head.className = 'ctx-head';
      head.setAttribute('aria-expanded', 'false');
      head.innerHTML = `
        <span class="logo">${slipstreamLogo(ctx.platform, { size: 15 })}</span>
        <span class="info">
          <span class="t"></span>
          <span class="m"></span>
          <span class="gauge"><i></i></span>
        </span>
        <span class="age"></span>
        <span class="caret">${CARET}</span>`;
      head.querySelector('.t').textContent = ctx.title || 'Untitled thread';
      head.querySelector('.m').textContent =
        `${source?.name || ctx.platform} · ${ctx.messageCount} turn${ctx.messageCount === 1 ? '' : 's'}`;
      head.querySelector('.age').textContent = timeAgo(ctx.capturedAt);
      // Gold measures: the same thread-length gauge the widget shows, so a
      // thread that is getting long says so on whichever surface you open.
      const fill = Math.min(1, ctx.messageCount / COMFORTABLE_TURNS);
      head.querySelector('.gauge i').style.transform = `scaleX(${fill})`;
      head.addEventListener('click', () => {
        const open = card.classList.toggle('open');
        head.setAttribute('aria-expanded', String(open));
      });

      const targets = document.createElement('div');
      targets.className = 'ctx-targets';
      const others = SLIPSTREAM_PLATFORM_LIST.filter((p) => p.id !== ctx.platform);
      others.forEach((target, i) => {
        const btn = document.createElement('button');
        btn.className = 'tbtn';
        btn.style.setProperty('--line', target.color);
        btn.style.setProperty('--i', String(i));
        btn.style.setProperty('--tint', target.color);
        btn.innerHTML =
          `<span class="logo">${slipstreamLogo(target.id, { size: 15 })}</span>` +
          `<span class="tname"></span><span class="go">${GO}</span>`;
        const label = btn.querySelector('.tname');
        label.textContent = target.name;
        btn.addEventListener('click', async () => {
          targets.querySelectorAll('button').forEach((b) => (b.disabled = true));
          label.textContent = 'Carrying…';
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
      });

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
      pill.style.setProperty('--tint', currentPlatform.color);
      // The line you are on names itself with its own mark, not a swatch.
      pill.querySelector('.bar').outerHTML =
        `<span class="logo">${slipstreamLogo(currentPlatform.id, { size: 14 })}</span>`;
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
