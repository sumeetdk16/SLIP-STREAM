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
    const seen = new Set(); // Track unique (role, text) combinations
    
    for (const { el, role } of pairs) {
      const text = readText(el);
      if (text.length < MIN_MESSAGE_CHARS) continue;
      
      // Create unique key for deduplication
      const key = `${role}:${text}`;
      
      // Skip if we've already seen this exact message
      if (seen.has(key)) continue;
      
      seen.add(key);
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
        const debug = localStorage.getItem('slipstream-debug') === 'true';
        
        // Try multiple selector strategies for ChatGPT's evolving markup
        // Strategy 1: data-message-author-role attribute (most reliable)
        let nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
        if (debug) console.log('[Slipstream] ChatGPT: Found', nodes.length, 'nodes with [data-message-author-role]');
        // Strategy 2: section > p pattern (2024 ChatGPT structure)
        // ChatGPT now uses <section> containers with <p> tags for message content
        if (!nodes.length) {
          const main = document.querySelector('main');
          if (main) {
            const sections = Array.from(main.querySelectorAll('section'));
            const messageParagraphs = [];
            
            sections.forEach(section => {
              const paragraphs = Array.from(section.querySelectorAll('p'));
              paragraphs.forEach(p => {
                const text = readText(p).trim();
                // Must have substantial text, not be UI chrome
                if (text.length > MIN_MESSAGE_CHARS && text.length < 5000) {
                  // Avoid "Copy", "Select text" UI labels
                  if (!text.match(/^(Copy|Select text|You said:|ChatGPT said:)$/i)) {
                    messageParagraphs.push(p);
                  }
                }
              });
            });
            
            if (messageParagraphs.length > 0) {
              nodes = messageParagraphs;
              if (debug) console.log('[Slipstream] ChatGPT fallback 1 (section>p): Found', nodes.length, 'messages');
            }
          }
        }
        
        // Strategy 3: Look for conversation turn containers
        if (!nodes.length) {
          nodes = Array.from(document.querySelectorAll('[data-testid*="conversation-turn"]'));
          if (debug) console.log('[Slipstream] ChatGPT fallback 1: Found', nodes.length, 'nodes with [data-testid*="conversation-turn"]');
        }
        
        // Strategy 4: Look for article elements
        if (!nodes.length) {
          nodes = Array.from(document.querySelectorAll('main article'));
          if (debug) console.log('[Slipstream] ChatGPT fallback 3: Found', nodes.length, 'article nodes');
        }
        
        // Strategy 4: Smart parent detection - find parent with multiple message-like children
        if (!nodes.length) {
          const main = document.querySelector('main');
          if (main) {
            // Find all divs in main
            const allDivs = Array.from(main.querySelectorAll('div'));
            
            // Group by parent and find parents with multiple substantial children
            const parentMap = new Map();
            allDivs.forEach(div => {
              const parent = div.parentElement;
              if (!parent) return;
              
              const text = readText(div).trim();
              // Must have substantial text and not too much (not the whole page)
              // Also must have few nested divs (actual messages don't have deep nesting)
              const nestedDivs = div.querySelectorAll('div').length;
              if (text.length > MIN_MESSAGE_CHARS && text.length < 5000 && nestedDivs < 20) {
                if (!parentMap.has(parent)) parentMap.set(parent, []);
                parentMap.get(parent).push(div);
              }
            });
            
            // Find parent with reasonable number of children (3-50 messages)
            // Require at least 3 to avoid false positives
            for (const [parent, children] of parentMap) {
              if (children.length >= 3 && children.length <= 50) {
                nodes = children;
                if (debug) console.log('[Slipstream] ChatGPT fallback 3: Found', nodes.length, 'smart-detected messages');
                break;
              }
            }
          }
        }
        
        // Strategy 5: Look for group pattern
        if (!nodes.length) {
          nodes = Array.from(document.querySelectorAll('main [class*="group"]')).filter(el => {
            const text = readText(el);
            return text.length > MIN_MESSAGE_CHARS && text.length < 5000;
          });
          if (debug) console.log('[Slipstream] ChatGPT fallback 4: Found', nodes.length, 'group nodes');
        }
        
        // Strategy 6: Deep scan - find divs at consistent depth with message-like content
        if (!nodes.length) {
          const main = document.querySelector('main');
          if (main) {
            const getDOMDepth = (el) => {
              let depth = 0;
              let current = el;
              while (current !== main && current.parentElement) {
                current = current.parentElement;
                depth++;
              }
              return depth;
            };
            
            const allDivs = Array.from(main.querySelectorAll('div')).filter(div => {
              const text = readText(div).trim();
              return text.length > MIN_MESSAGE_CHARS && text.length < 5000;
            });
            
            // Group by depth
            const byDepth = {};
            allDivs.forEach(div => {
              const depth = getDOMDepth(div);
              if (!byDepth[depth]) byDepth[depth] = [];
              byDepth[depth].push(div);
            });
            
            // Find depth with reasonable message count (3-50), require at least 3
            for (const depth in byDepth) {
              const count = byDepth[depth].length;
              if (count >= 3 && count <= 50) {
                nodes = byDepth[depth];
                if (debug) console.log('[Slipstream] ChatGPT fallback 5: Found', nodes.length, 'messages at depth', depth);
                break;
              }
            }
          }
        }
        
        const messages = collect(
          nodes.map((el, idx) => {
            // Check data attribute first
            const roleAttr = el.getAttribute('data-message-author-role');
            if (roleAttr) {
              return { el, role: roleAttr === 'user' ? 'user' : 'assistant' };
            }
            
            // Check testid attribute
            const testid = el.getAttribute('data-testid');
            if (testid) {
              if (testid.includes('user')) return { el, role: 'user' };
              if (testid.includes('assistant') || testid.includes('bot')) return { el, role: 'assistant' };
            }
            
            // Heuristic: ChatGPT alternates user/assistant, typically starts with user
            // This is a fallback when we can't detect roles properly
            return { el, role: idx % 2 === 0 ? 'user' : 'assistant' };
          })
        );
        
        if (debug) console.log('[Slipstream] ChatGPT: Collected', messages.length, 'messages');
        return messages;
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

    grok: {
      extract() {
        const bubbles = Array.from(
          document.querySelectorAll('.message-bubble, [class*="message-bubble"]')
        );
        if (bubbles.length) {
          return collect(
            bubbles.map((el) => {
              // Grok right-aligns the user's own messages; that alignment is the
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
        const debug = localStorage.getItem('slipstream-debug') === 'true';
        
        // Grok's actual textarea selectors - updated for real interface
        const selectors = [
          // Most specific first
          'textarea[placeholder*="Ask"]',
          'textarea[placeholder*="Message"]',
          'textarea[placeholder*="Type"]',
          'textarea[data-testid]',
          'textarea[class*="input"]',
          'textarea[class*="composer"]',
          'textarea[placeholder]',
          'textarea[aria-label]',
          'form textarea',
          'textarea:not([hidden]):not([disabled])',
          '[contenteditable="true"][role="textbox"]',
          'textarea',
          'div[contenteditable="true"]'
        ];
        
        if (debug) console.log('[Slipstream] Searching for Grok composer...');
        
        // First pass: look for visible textareas
        for (const sel of selectors) {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            const isVisible = el.offsetParent !== null || (rect.height > 0 && rect.width > 0);
            const notHidden = !el.hidden && el.style.display !== 'none' && el.style.visibility !== 'hidden';
            
            if (isVisible && notHidden) {
              if (debug) console.log('[Slipstream] Grok composer found:', sel, el);
              return el;
            }
          }
        }
        
        // Second pass: any textarea
        const anyTextarea = document.querySelector('textarea');
        if (anyTextarea) {
          if (debug) console.log('[Slipstream] Grok found any textarea');
          return anyTextarea;
        }
        
        // Last resort: contenteditable
        const contentEditable = document.querySelector('div[contenteditable="true"]');
        if (debug && contentEditable) console.log('[Slipstream] Grok using contenteditable');
        if (debug && !contentEditable) console.log('[Slipstream] Grok composer NOT FOUND');
        return contentEditable;
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
   * single assistant message. Roles are lost, so callers flag the result degraded.
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
