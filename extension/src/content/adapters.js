/**
 * Slipstream — per-platform DOM adapters.
 *
 * Chat UIs rewrite their markup often, so every adapter is written as a list of
 * candidate selectors with a generic fallback underneath. An adapter that reads
 * a slightly degraded thread is far better than one that throws.
 */
/* global slipstreamPlatformForHost */
(function (root) {
  'use strict';

  /* -------------------------------------------------------------- utilities */

  /** innerText minus the chrome chat UIs bolt onto messages (copy buttons, etc). */
  function readText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone
      .querySelectorAll('button, svg, [role="button"], [aria-hidden="true"], .sr-only, script, style')
      .forEach((n) => n.remove());
    return (clone.innerText || clone.textContent || '')
      .replace(/ /g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function firstEl(selectors, scope = document) {
    for (const sel of selectors) {
      const el = scope.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    // Second pass without the visibility test: some composers are position:fixed
    // with an offsetParent of null while perfectly usable.
    for (const sel of selectors) {
      const el = scope.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set;
    setter ? setter.call(el, value) : (el.value = value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Rich composers (ProseMirror, Lexical, Quill) only trust real editing
   * events. execCommand('insertText') is deprecated but remains the one path
   * every one of them observes; the beforeinput dispatch is the backup.
   */
  function setRichText(el, text) {
    el.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);

    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        el.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertFromPaste',
            dataTransfer: dt
          })
        );
      } catch {
        // No DataTransfer here; the direct write below is the remaining path.
      }
      if (readText(el) !== text) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function writeComposer(el, text) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') setNativeValue(el, text);
    else setRichText(el, text);
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return true;
  }

  function readComposer(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
    return readText(el);
  }

  /** Messages shorter than this are almost always UI noise, not conversation. */
  const MIN_MESSAGE_CHARS = 2;

  function collect(pairs) {
    const out = [];
    for (const { el, role } of pairs) {
      const text = readText(el);
      if (text.length < MIN_MESSAGE_CHARS) continue;
      // Streaming re-renders can duplicate the final node; collapse repeats.
      const last = out[out.length - 1];
      if (last && last.role === role && last.text === text) continue;
      out.push({ role, text });
    }
    return out;
  }

  /** Resolves an ordered [{el, role}] list from a role-tagged selector map. */
  function orderedByRole(selectorsByRole) {
    const all = Object.values(selectorsByRole).flat().join(', ');
    if (!all) return [];
    const nodes = Array.from(document.querySelectorAll(all));
    return nodes.map((el) => {
      for (const [role, selectors] of Object.entries(selectorsByRole)) {
        if (selectors.some((s) => el.matches(s))) return { el, role };
      }
      return { el, role: 'assistant' };
    });
  }

  /* --------------------------------------------------------------- adapters */

  const adapters = {
    chatgpt: {
      extract() {
        const nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
        return collect(
          nodes.map((el) => ({
            el,
            role: el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant'
          }))
        );
      },
      composer: () =>
        firstEl(['#prompt-textarea', 'div[contenteditable="true"][id*="prompt"]', 'form textarea']),
      title: () =>
        readText(document.querySelector('nav a[data-active], nav li[data-active] a')) ||
        document.title.replace(/\s*[—|-]\s*ChatGPT\s*$/i, ''),
      threadKey: () => location.pathname.match(/\/c\/([\w-]+)/)?.[1] || location.pathname
    },

    claude: {
      extract() {
        const pairs = orderedByRole({
          user: ['[data-testid="user-message"]', 'div.font-user-message'],
          assistant: ['.font-claude-message', '[data-testid="assistant-message"]', '.font-claude-response']
        });
        return collect(pairs);
      },
      composer: () =>
        firstEl([
          'div[contenteditable="true"].ProseMirror',
          'fieldset div[contenteditable="true"]',
          'div[contenteditable="true"]'
        ]),
      title: () =>
        readText(document.querySelector('[data-testid="chat-menu-trigger"]')) ||
        document.title.replace(/\s*[—|-]\s*Claude\s*$/i, ''),
      threadKey: () => location.pathname.match(/\/chat\/([\w-]+)/)?.[1] || location.pathname
    },

    gemini: {
      extract() {
        const pairs = orderedByRole({
          user: ['user-query', '.query-text'],
          assistant: ['model-response', 'message-content.model-response-text']
        });
        return collect(pairs);
      },
      composer: () =>
        firstEl(['rich-textarea div[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]']),
      title: () =>
        readText(document.querySelector('.conversation.selected .conversation-title')) ||
        document.title.replace(/\s*[—|-]\s*Gemini\s*$/i, ''),
      threadKey: () => location.pathname.match(/\/app\/([\w-]+)/)?.[1] || location.pathname
    },

    copilot: {
      extract() {
        const pairs = orderedByRole({
          user: ['[data-content="user-message"]', '[data-testid="user-message"]'],
          assistant: ['[data-content="ai-message"]', '[data-testid="ai-message"]']
        });
        return collect(pairs);
      },
      composer: () => firstEl(['#userInput', 'textarea[placeholder]', 'div[contenteditable="true"]']),
      title: () => document.title.replace(/\s*[—|-]\s*(Microsoft\s*)?Copilot\s*$/i, ''),
      threadKey: () => location.pathname + location.search
    },

    grok: {
      extract() {
        const bubbles = Array.from(
          document.querySelectorAll('.message-bubble, [class*="message-bubble"]')
        );
        if (bubbles.length) {
          return collect(
            bubbles.map((el) => {
              // Grok right-aligns the user's own turns; that alignment is the
              // only stable role signal in its markup, and it sits on one of
              // the wrappers rather than the bubble itself.
              let cls = String(el.className || '');
              let node = el.parentElement;
              for (let depth = 0; node && depth < 3; depth++) {
                cls += ' ' + String(node.className || '');
                node = node.parentElement;
              }
              const isUser = /items-end|justify-end|ml-auto/.test(cls);
              return { el, role: isUser ? 'user' : 'assistant' };
            })
          );
        }
        return [];
      },
      composer: () =>
        firstEl(['textarea[aria-label]', 'form textarea', 'div[contenteditable="true"]']),
      title: () => document.title.replace(/\s*[—|-]\s*Grok\s*$/i, ''),
      threadKey: () => location.pathname
    },

    perplexity: {
      extract() {
        const pairs = orderedByRole({
          user: ['[class*="group/query"]', 'h1.group\\/query'],
          assistant: ['[id^="markdown-content"]', '.prose']
        });
        return collect(pairs);
      },
      composer: () => firstEl(['textarea[placeholder]', 'div[contenteditable="true"]']),
      title: () => document.title.replace(/\s*[—|-]\s*Perplexity\s*$/i, ''),
      threadKey: () => location.pathname
    }
  };

  /**
   * Last resort when selectors miss entirely: take the main column's text as a
   * single assistant turn. Roles are lost, so callers flag the result degraded.
   */
  function fallbackExtract() {
    const main = document.querySelector('main') || document.body;
    const text = readText(main);
    if (text.length < 80) return [];
    return [{ role: 'assistant', text: text.slice(-8000) }];
  }

  function currentAdapter() {
    const platform = slipstreamPlatformForHost(location.hostname);
    if (!platform) return null;
    const adapter = adapters[platform.id];
    if (!adapter) return null;
    return { platform, adapter };
  }

  function capture() {
    const current = currentAdapter();
    if (!current) return null;
    const { platform, adapter } = current;

    let messages = [];
    let degraded = false;
    try {
      messages = adapter.extract() || [];
    } catch {
      messages = [];
    }
    if (!messages.length) {
      messages = fallbackExtract();
      degraded = messages.length > 0;
    }

    return {
      platform: platform.id,
      title: (adapter.title() || '').trim().slice(0, 120),
      url: location.href,
      threadKey: `${platform.id}:${adapter.threadKey()}`,
      messages,
      degraded
    };
  }

  root.SlipstreamAdapters = {
    capture,
    currentAdapter,
    writeComposer,
    readComposer,
    readText,
    getComposer() {
      const current = currentAdapter();
      return current ? current.adapter.composer() : null;
    }
  };
})(window);
