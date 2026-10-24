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
    const debug = localStorage.getItem('slipstream-debug') === 'true';
    
    for (const sel of selectors) {
      const el = scope.querySelector(sel);
      if (el && el.offsetParent !== null) {
        if (debug) console.log('[Slipstream] Found element with selector:', sel);
        return el;
      }
    }
    // Second pass without the visibility test: some composers are position:fixed
    // with an offsetParent of null while perfectly usable.
    for (const sel of selectors) {
      const el = scope.querySelector(sel);
      if (el) {
        if (debug) console.log('[Slipstream] Found element (no visibility check):', sel);
        return el;
      }
    }
    
    if (debug) console.log('[Slipstream] No element found from selectors:', selectors);
    return null;
  }

  function setNativeValue(el, value) {
    const debug = localStorage.getItem('slipstream-debug') === 'true';
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set;
    
    // Set value using native setter
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    
    // Focus the element
    el.focus();
    
    // Fire all events that frameworks might listen to
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('keydown', { bubbles: true }));
    el.dispatchEvent(new Event('keyup', { bubbles: true }));
    
    if (debug) console.log('[Slipstream] setNativeValue: Set', value.length, 'chars to', el.tagName);
  }

  /**
   * Rich composers (ProseMirror, Lexical, Quill) need special handling.
   * We try multiple strategies synchronously and asynchronously.
   */
  function setRichText(el, text) {
    const debug = localStorage.getItem('slipstream-debug') === 'true';
    
    el.focus();
    
    // Clear existing content first
    el.textContent = '';
    
    // Strategy 1: Use execCommand if available (works for many editors)
    let success = false;
    try {
      success = document.execCommand('insertText', false, text);
      if (debug && success) console.log('[Slipstream] execCommand succeeded');
    } catch (e) {
      if (debug) console.log('[Slipstream] execCommand not available');
    }
    
    // Strategy 2: Set textContent + fire events
    if (!success) {
      el.textContent = text;
      
      // Fire input events that React/Vue/modern frameworks listen to
      el.dispatchEvent(new InputEvent('beforeinput', { 
        bubbles: true, 
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
      
      el.dispatchEvent(new InputEvent('input', { 
        bubbles: true, 
        inputType: 'insertText', 
        data: text 
      }));
      
      if (debug) console.log('[Slipstream] Direct textContent + events');
    }
    
    // Always fire change event
    el.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Skip cursor positioning - it's causing errors and isn't critical for paste functionality
    // The text will be pasted successfully even without setting cursor position
  }

  function writeComposer(el, text) {
    if (!el) return false;
    const debug = localStorage.getItem('slipstream-debug') === 'true';
    
    if (debug) console.log('[Slipstream] writeComposer called:', el.tagName, el.id || el.className);
    
    // For TEXTAREA and INPUT elements
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      setNativeValue(el, text);
      
      // Verify immediately for textareas
      setTimeout(() => {
        const check = readComposer(el);
        if (debug) console.log('[Slipstream] Textarea write verification:', check.length, 'chars');
      }, 100);
    } 
    // For contenteditable (ChatGPT, Gemini, Claude, etc.)
    else {
      // Try multiple strategies for contenteditable
      setRichText(el, text);
      
      // Verify after a delay
      setTimeout(() => {
        const check = readComposer(el);
        if (debug) console.log('[Slipstream] Write verification:', check.length, 'chars written');
        
        // If it didn't work, try more aggressive approaches
        if (check.length === 0 && text.length > 0) {
          if (debug) console.log('[Slipstream] Retry: text did not stick, trying aggressive fallback');
          
          // Fallback 1: Direct innerHTML with <p> tags (works for some editors)
          try {
            el.innerHTML = `<p>${text.replace(/\n/g, '</p><p>')}</p>`;
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (debug) console.log('[Slipstream] Tried innerHTML with <p> tags');
          } catch (e) {
            if (debug) console.log('[Slipstream] innerHTML failed:', e.message);
          }
          
          // Fallback 2: Just plain text, no formatting
          setTimeout(() => {
            const check2 = readComposer(el);
            if (check2.length === 0) {
              el.textContent = text;
              el.dispatchEvent(new InputEvent('input', { bubbles: true }));
              if (debug) console.log('[Slipstream] Tried plain textContent fallback');
            }
          }, 200);
        }
      }, 300);
    }
    
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
        // Try multiple selector strategies for ChatGPT's evolving markup
        let nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
        
        // Fallback: look for message containers with role attributes
        if (!nodes.length) {
          nodes = Array.from(document.querySelectorAll('[data-testid*="conversation-turn"]'));
        }
        
        // Fallback: look for common message wrapper patterns
        if (!nodes.length) {
          nodes = Array.from(document.querySelectorAll('main [class*="group"]')).filter(el => {
            const text = readText(el);
            return text.length > MIN_MESSAGE_CHARS;
          });
        }
        
        return collect(
          nodes.map((el) => {
            // Check data attribute first
            const roleAttr = el.getAttribute('data-message-author-role');
            if (roleAttr) {
              return { el, role: roleAttr === 'user' ? 'user' : 'assistant' };
            }
            
            // Fallback: detect role from content or position
            // ChatGPT typically right-aligns or differently styles user messages
            const classes = el.className || '';
            const isUser = classes.includes('user') || 
                          el.querySelector('[data-message-author-role="user"]') ||
                          el.closest('[data-message-author-role="user"]');
            return { el, role: isUser ? 'user' : 'assistant' };
          })
        );
      },
      composer: () =>
        firstEl([
          '#prompt-textarea', 
          'div[contenteditable="true"][id*="prompt"]',
          'textarea[placeholder*="Message"]',
          'textarea[data-id="root"]',
          'form textarea',
          'div[contenteditable="true"]'
        ]),
      title: () =>
        readText(document.querySelector('nav a[data-active], nav li[data-active] a, nav button[data-active]')) ||
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
        // Try multiple selector strategies for Gemini's markup
        const pairs = orderedByRole({
          user: [
            'user-query', 
            '.query-text',
            '[class*="user-query"]',
            '[data-test-id*="user"]',
            'message-content[role="user"]'
          ],
          assistant: [
            'model-response',
            'message-content.model-response-text',
            '[class*="model-response"]',
            '[data-test-id*="model"]',
            'message-content[role="assistant"]',
            '.response-container'
          ]
        });
        
        // If ordered extraction fails, try a simpler approach
        if (!pairs.length) {
          const messages = Array.from(document.querySelectorAll('message-content, [class*="message"]')).filter(el => {
            return readText(el).length > MIN_MESSAGE_CHARS;
          });
          return collect(messages.map((el, idx) => ({
            el,
            // Gemini typically alternates user/assistant
            role: idx % 2 === 0 ? 'user' : 'assistant'
          })));
        }
        
        return collect(pairs);
      },
      composer: () =>
        firstEl([
          'rich-textarea div[contenteditable="true"]',
          'div.ql-editor[contenteditable="true"]',
          '[data-placeholder] div[contenteditable="true"]',
          'textarea[aria-label*="prompt"]',
          'div[contenteditable="true"][role="textbox"]'
        ]),
      title: () =>
        readText(document.querySelector('.conversation.selected .conversation-title, [aria-label*="conversation"]')) ||
        document.title.replace(/\s*[—|-]\s*Gemini\s*$/i, ''),
      threadKey: () => location.pathname.match(/\/app\/([\w-]+)/)?.[1] || location.pathname
    },

    copilot: {
      extract() {
        // Try multiple selector strategies for Copilot's markup
        // Copilot has different layouts for chat vs search modes
        const pairs = orderedByRole({
          user: [
            '[data-content="user-message"]',
            '[data-testid="user-message"]',
            '[class*="user-message"]',
            'cib-message-group[source="user"]',
            '.user-message',
            'cib-message[type="user"]',
            '[class*="request"]'
          ],
          assistant: [
            '[data-content="ai-message"]',
            '[data-testid="ai-message"]',
            '[class*="bot-message"]',
            'cib-message-group[source="bot"]',
            '.bot-message',
            'cib-message[type="bot"]',
            '[class*="response"]',
            '[class*="answer"]'
          ]
        });
        
        // Fallback: look for message groups
        if (!pairs.length) {
          const messages = Array.from(document.querySelectorAll('cib-message-group, cib-message, [class*="message-group"], [class*="turn-"]')).filter(el => {
            return readText(el).length > MIN_MESSAGE_CHARS;
          });
          return collect(messages.map(el => {
            const source = el.getAttribute('source') || el.getAttribute('type');
            const classes = el.className || '';
            const isUser = source === 'user' || classes.includes('user') || classes.includes('request');
            return { el, role: isUser ? 'user' : 'assistant' };
          }));
        }
        
        return collect(pairs);
      },
      composer: () => firstEl([
        '#userInput',
        'textarea[placeholder*="Ask"]',
        'textarea[id*="searchbox"]',
        'cib-text-input textarea',
        'textarea[placeholder*="me anything"]',
        'textarea.textarea',
        '[class*="input"] textarea',
        'textarea[placeholder]',
        'div[contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]'
      ]),
      title: () => document.title.replace(/\s*[—|-]\s*(Microsoft\s*)?Copilot\s*$/i, ''),
      threadKey: () => {
        // Extract conversation ID from URL if present
        const match = location.search.match(/[?&](?:threadId|conversationId|id)=([^&]+)/);
        return match ? `copilot-${match[1]}` : location.pathname + location.search;
      }
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
      composer: () => {
        // Try to find Grok's textarea with multiple strategies
        const selectors = [
          'textarea[placeholder*="Type"]',
          'textarea[placeholder*="slash"]',
          'textarea[placeholder*="use"]',
          'textarea[aria-label]',
          'textarea[name]',
          'form textarea',
          'textarea:not([hidden]):not([disabled])',
          'textarea',
          'div[contenteditable="true"]'
        ];
        
        // First pass: look for visible textareas
        for (const sel of selectors) {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            // Check if element is visible
            if (el.offsetParent !== null || el.getBoundingClientRect().height > 0) {
              return el;
            }
          }
        }
        
        // Second pass: any textarea at all (even if hidden initially)
        const anyTextarea = document.querySelector('textarea');
        if (anyTextarea) return anyTextarea;
        
        // Last resort: contenteditable
        return document.querySelector('div[contenteditable="true"]');
      },
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
    const debug = localStorage.getItem('slipstream-debug') === 'true';

    let messages = [];
    let degraded = false;
    try {
      messages = adapter.extract() || [];
      if (debug) console.log('[Slipstream] Extracted messages:', messages.length);
    } catch (err) {
      if (debug) console.error('[Slipstream] Extract failed:', err);
      messages = [];
    }
    if (!messages.length) {
      messages = fallbackExtract();
      degraded = messages.length > 0;
      if (debug && degraded) console.log('[Slipstream] Using fallback extract');
    }

    const result = {
      platform: platform.id,
      title: (adapter.title() || '').trim().slice(0, 120),
      url: location.href,
      threadKey: `${platform.id}:${adapter.threadKey()}`,
      messages,
      degraded
    };
    
    if (debug) console.log('[Slipstream] Capture result:', result);
    return result;
  }

  root.SlipstreamAdapters = {
    capture,
    currentAdapter,
    writeComposer,
    readComposer,
    readText,
    getComposer() {
      const current = currentAdapter();
      const debug = localStorage.getItem('slipstream-debug') === 'true';
      
      if (!current) {
        if (debug) console.log('[Slipstream] No adapter for current platform');
        return null;
      }
      
      // Get composer from platform adapter
      let composer = current.adapter.composer();
      
      if (composer) {
        if (debug) console.log('[Slipstream] Platform adapter found composer:', composer.tagName, composer.id || composer.className);
        return composer;
      }
      
      // Only try ultra-fallback if platform adapter returned null
      if (debug) console.log('[Slipstream] Platform composer not found, trying generic fallbacks');
      
      // Try common textarea patterns
      composer = firstEl([
        'textarea[placeholder]',
        'textarea:not([hidden]):not([disabled])',
        'form textarea'
      ]);
      
      if (composer) {
        if (debug) console.log('[Slipstream] Found composer using generic textarea fallback');
        return composer;
      }
      
      // Try common contenteditable patterns
      composer = firstEl([
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]:not([aria-hidden="true"])',
        '[contenteditable="true"]'
      ]);
      
      if (composer) {
        if (debug) console.log('[Slipstream] Found composer using contenteditable fallback');
        return composer;
      }
      
      // Try to find main input area by common form patterns
      const mainForm = document.querySelector('form[action*="chat"], form[action*="message"], main form');
      if (mainForm) {
        composer = mainForm.querySelector('textarea, [contenteditable="true"]');
        if (debug && composer) console.log('[Slipstream] Found composer in main form');
        if (composer) return composer;
      }
      
      if (debug) console.log('[Slipstream] No composer found at all');
      return null;
    }
  };
})(window);
