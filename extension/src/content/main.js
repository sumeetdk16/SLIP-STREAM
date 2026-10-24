/**
 * Slipstream — content script entry point.
 *
 * Wires the adapters, the limit watcher and the widget together, and owns the
 * only conversation with the service worker.
 */
/* global SlipstreamAdapters, SlipstreamWidget, SlipstreamLimitWatcher, slipstreamPlatformForHost */
(function () {
  'use strict';

  // Early exit if extension context is invalid (extension was reloaded)
  if (!chrome.runtime?.id) {
    console.warn('[Slipstream] Extension context invalid. Please reload this page.');
    return;
  }

  const platform = slipstreamPlatformForHost(location.hostname);
  if (!platform) return;
  // x.com hosts far more than Grok; only run inside the Grok surface.
  if (platform.id === 'grok' && location.hostname.endsWith('x.com') && !location.pathname.startsWith('/i/grok')) {
    return;
  }
  if (window.__slipstreamLoaded) return;
  window.__slipstreamLoaded = true;

  const AUTO_CAPTURE_DEBOUNCE_MS = 4000;
  const COMPOSER_WAIT_MS = 12000; // Increased to 12s for slow-loading pages like Gemini
  /**
   * Extraction walks and clones every message in the thread, so an automatic
   * capture is never cheap. These pages mutate constantly even when nobody is
   * typing (carets, virtualised lists, polling), so without a floor the
   * debounce alone would re-extract a long thread every few seconds forever.
   */
  const MIN_AUTO_CAPTURE_GAP_MS = 8000; // Reduced from 10s to 8s for faster updates
  const WIDGET_HOST_ID = 'slipstream-root';

  let widget = null;
  let watcher = null;
  let lastSignature = '';
  let lastAutoCaptureAt = 0;
  let settings = { widgetEnabled: true, autoCapture: true, limitAlerts: true };

  /* ------------------------------------------------------------ messaging */

  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        return reject(new Error('Extension context invalidated - please reload the page'));
      }
      
      try {
        chrome.runtime.sendMessage({ type, payload }, (res) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            // Extension was reloaded
            if (lastError.message?.includes('Extension context invalidated')) {
              console.warn('[Slipstream] Extension was reloaded. Please refresh this page.');
              return reject(new Error('Extension reloaded - please refresh the page'));
            }
            return reject(new Error(lastError.message));
          }
          if (!res?.ok) return reject(Object.assign(new Error(res?.error || 'Request failed'), { code: res?.code }));
          resolve(res.data);
        });
      } catch (err) {
        reject(new Error('Extension context invalidated - please reload the page'));
      }
    });
  }

  /* ------------------------------------------------------------- capturing */

  /** Cheap fingerprint so an unchanged thread never hits storage twice. */
  function signature(capture) {
    if (!capture?.messages?.length) return '';
    const last = capture.messages[capture.messages.length - 1];
    return `${capture.threadKey}|${capture.messages.length}|${last.text.length}`;
  }

  async function captureNow({ manual = false } = {}) {
    const debug = localStorage.getItem('slipstream-debug') === 'true';
    
    if (!manual) {
      if (document.hidden) {
        if (debug) console.log('[Slipstream] Skipping capture: document hidden');
        return null;
      }
      const timeSinceLastCapture = Date.now() - lastAutoCaptureAt;
      if (timeSinceLastCapture < MIN_AUTO_CAPTURE_GAP_MS) {
        if (debug) console.log(`[Slipstream] Skipping capture: too soon (${timeSinceLastCapture}ms < ${MIN_AUTO_CAPTURE_GAP_MS}ms)`);
        return null;
      }
      lastAutoCaptureAt = Date.now();
    }
    
    if (debug) console.log('[Slipstream] Starting capture...', { manual, url: location.href });
    const capture = SlipstreamAdapters.capture();
    if (!capture) {
      if (debug) console.log('[Slipstream] No capture returned from adapter');
      return null;
    }
    
    if (debug) console.log('[Slipstream] Captured:', {
      messages: capture.messages.length,
      platform: capture.platform,
      degraded: capture.degraded,
      title: capture.title
    });

    widget?.setCapture(capture);
    if (!capture.messages.length) {
      if (debug) console.log('[Slipstream] No messages in capture');
      return null;
    }

    const sig = signature(capture);
    if (!manual && sig === lastSignature) {
      if (debug) console.log('[Slipstream] Signature unchanged, skipping save');
      return null;
    }
    lastSignature = sig;

    await send('CAPTURE_CONTEXT', { capture: { ...capture, auto: !manual } });
    const contexts = await send('LIST_CONTEXTS');
    widget?.setContexts(contexts);
    // The freshest capture of this thread is the one the user means.
    const mine = contexts.find((c) => c.threadKey === capture.threadKey);
    if (mine) widget?.setSelected(mine.id);
    
    if (debug) console.log('[Slipstream] Capture saved successfully');
    return capture;
  }

  /* -------------------------------------------------------------- handoff */

  async function handoff({ target }) {
    await captureNow({ manual: true });
    const contextId = widget?.selectedId();
    const result = await send('SEND_HANDOFF', { contextId, targetPlatformId: target.id });
    if (!result.summarized) {
      widget?.notify('Sent without AI summary — add a Groq key for tighter briefs.');
    }
    return result;
  }

  async function copyBrief() {
    const contextId = widget?.selectedId();
    if (!contextId) {
      widget?.notify('Capture a thread first', true);
      return;
    }
    const fallbackTarget = self.SLIPSTREAM_PLATFORM_LIST.find((p) => p.id !== platform.id);
    try {
      const built = await send('BUILD_HANDOFF', {
        contextId,
        targetPlatformId: fallbackTarget.id
      });
      await navigator.clipboard.writeText(built.text);
      widget?.notify(built.summarized ? 'Brief copied to clipboard' : 'Raw context copied (no Groq key)');
    } catch (err) {
      widget?.notify(err?.message || 'Could not build the brief', true);
    }
  }

  /* ------------------------------------------------------------- enhancer */

  async function enhance({ raw }) {
    const capture = SlipstreamAdapters.capture();
    const tail = (capture?.messages || []).slice(-2).map((m) => m.text).join('\n');
    const { text } = await send('ENHANCE_PROMPT', {
      raw,
      platformId: platform.id,
      context: tail
    });
    const composer = SlipstreamAdapters.getComposer();
    if (composer) SlipstreamAdapters.writeComposer(composer, text);
    return text;
  }

  /* ------------------------------------------------- inbound handoff fill */

  function waitForComposer(timeout = COMPOSER_WAIT_MS) {
    return new Promise((resolve) => {
      const started = Date.now();
      const debug = localStorage.getItem('slipstream-debug') === 'true';
      let attempts = 0;
      
      // Platform-specific intervals and waits
      let checkInterval = 200;
      let pageLoadWait = 0;
      
      if (platform.id === 'chatgpt') {
        checkInterval = 250;
        pageLoadWait = 800; // ChatGPT needs time to load composer
      } else if (platform.id === 'gemini') {
        checkInterval = 300;
        pageLoadWait = 800;
      } else if (platform.id === 'grok') {
        checkInterval = 300;
        pageLoadWait = 1500; // Grok /chat page needs time to load textarea
      }
      
      const tick = () => {
        attempts++;
        const elapsed = Date.now() - started;
        
        // Give the page initial time to load before checking
        if (elapsed < pageLoadWait) {
          setTimeout(tick, checkInterval);
          return;
        }
        
        // For ChatGPT, check if page is interactive
        if (platform.id === 'chatgpt') {
          const hasMain = document.querySelector('main');
          const hasForm = document.querySelector('form');
          if (!hasMain && !hasForm && elapsed < 3000) {
            if (debug && attempts % 5 === 0) console.log('[Slipstream] Waiting for ChatGPT to load...');
            setTimeout(tick, 300);
            return;
          }
        }
        
        // For Grok, check if page is ready and has textarea
        if (platform.id === 'grok') {
          // Wait for chat interface to be ready
          const hasTextarea = document.querySelector('textarea');
          const hasForm = document.querySelector('form');
          const hasMain = document.querySelector('main');
          
          // If no textarea yet and we're early, keep waiting
          if (!hasTextarea && elapsed < 8000) {
            if (debug && attempts % 10 === 0) {
              console.log('[Slipstream] Grok: Waiting for textarea...', {
                elapsed,
                hasForm,
                hasMain,
                textareaCount: document.querySelectorAll('textarea').length
              });
            }
            setTimeout(tick, 300);
            return;
          }
          
          // Log if we still don't have textarea after extended wait
          if (!hasTextarea && elapsed >= 8000 && debug) {
            console.log('[Slipstream] Grok: No textarea after 8s', {
              url: location.href,
              hasForm,
              hasMain
            });
          }
        }
        
        if (platform.id === 'gemini') {
          // Check if still on landing page
          const onLanding = document.querySelector('[href*="chat"]') && !document.querySelector('rich-textarea, [contenteditable]');
          if (onLanding && elapsed < 5000) {
            if (debug && attempts % 5 === 0) console.log('[Slipstream] Waiting for Gemini app to load...');
            setTimeout(tick, 400);
            return;
          }
        }
        
        const el = SlipstreamAdapters.getComposer();
        if (el) {
          if (debug) console.log(`[Slipstream] Composer found after ${attempts} attempts (${elapsed}ms)`);
          return resolve(el);
        }
        if (elapsed > timeout) {
          if (debug) console.log(`[Slipstream] Composer timeout after ${attempts} attempts`);
          return resolve(null);
        }
        setTimeout(tick, checkInterval);
      };
      tick();
    });
  }

  async function applyPendingHandoff() {
    const debug = localStorage.getItem('slipstream-debug') === 'true';
    let entry;
    try {
      ({ entry } = await send('CONSUME_PENDING', { platformId: platform.id }));
      if (debug) console.log('[Slipstream] Pending handoff:', entry ? 'found' : 'none');
    } catch (err) {
      if (debug) console.error('[Slipstream] Failed to consume pending:', err);
      return;
    }
    if (!entry) return;

    const composer = await waitForComposer();
    if (!composer) {
      await navigator.clipboard.writeText(entry.text).catch(() => {});
      widget?.notify('Could not find the composer — context copied to clipboard', true);
      if (debug) console.log('[Slipstream] Context copied to clipboard as fallback');
      return;
    }
    
    // Reduced delays - faster paste
    const delay = 150;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Focus the composer first to ensure it's ready
    try {
      composer.focus();
      await new Promise(resolve => setTimeout(resolve, 100)); // Faster focus delay
    } catch (e) {
      if (debug) console.log('[Slipstream] Could not focus composer:', e);
    }
    
    SlipstreamAdapters.writeComposer(composer, entry.text);
    widget?.notify('Context carried over. Review it, then send.');
    if (debug) console.log('[Slipstream] Context auto-pasted successfully');
  }

  /* ---------------------------------------------------------------- limits */

  function startLimitWatcher() {
    watcher?.stop();
    watcher = SlipstreamLimitWatcher.createWatcher({
      platform,
      onDetect: async (info) => {
        // Capture before telling the user: the thread they want to rescue is
        // the one that just got cut off.
        await captureNow({ manual: true }).catch(() => {});
        widget?.showLimit(info);
        send('LIMIT_DETECTED', { platformId: platform.id }).catch(() => {});
      },
      onClear: () => {
        widget?.clearLimit();
        send('CLEAR_BADGE').catch(() => {});
      }
    });
    watcher.start();
  }

  /* ------------------------------------------------------------ lifecycle */

  let captureTimer = null;
  function scheduleCapture() {
    if (!settings.autoCapture || document.hidden) return;
    clearTimeout(captureTimer);
    captureTimer = setTimeout(() => captureNow().catch(() => {}), AUTO_CAPTURE_DEBOUNCE_MS);
  }

  /** True for mutations the widget itself caused — never worth re-capturing. */
  function isOurOwnMutation(node) {
    const host = document.getElementById(WIDGET_HOST_ID);
    return !!host && (node === host || host.contains(node));
  }

  function watchThreadChanges() {
    let lastUrl = location.href;
    const onNavigate = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      lastSignature = '';
      widget?.clearLimit();
      setTimeout(() => captureNow().catch(() => {}), 1200);
    };

    // These apps are SPAs: history changes, not loads, are what move threads.
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        queueMicrotask(onNavigate);
        return result;
      };
    }
    window.addEventListener('popstate', onNavigate);

    const observer = new MutationObserver((records) => {
      // A hidden tab is not producing new conversation, and re-arming the
      // debounce on every record of a background page is most of what made a
      // pile of open chat tabs sit on the CPU.
      if (document.hidden) return;
      for (const record of records) {
        if (!isOurOwnMutation(record.target)) return scheduleCapture();
      }
    });
    const target = document.querySelector('main') || document.body;
    observer.observe(target, { childList: true, subtree: true });

    // Whatever happened while the tab was in the background is picked up once,
    // when the user comes back to it.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleCapture();
    });
  }

  async function mountWidget() {
    widget = SlipstreamWidget.create({
      platform,
      onCapture: (opts) => captureNow({ manual: true, ...opts }),
      onHandoff: handoff,
      onEnhance: enhance,
      onPreview: copyBrief,
      onOpenSettings: () => send('OPEN_OPTIONS').catch(() => chrome.runtime.openOptionsPage?.()),
      onSelectContext: () => {},
      onDismissLimit: () => send('CLEAR_BADGE').catch(() => {}),
      readComposer: () => SlipstreamAdapters.readComposer(SlipstreamAdapters.getComposer()),
      writeComposer: (text) => {
        const el = SlipstreamAdapters.getComposer();
        if (el) SlipstreamAdapters.writeComposer(el, text);
      }
    });
    widget.setVisible(settings.widgetEnabled !== false);

    const contexts = await send('LIST_CONTEXTS').catch(() => []);
    widget.setContexts(contexts);
  }

  chrome.runtime.onMessage.addListener((msg, sender) => {
    // Only our own service worker drives the widget — never the host page.
    if (sender?.id !== chrome.runtime.id || sender?.tab) return;
    if (msg?.type === 'CMD_TOGGLE') widget?.toggle();
    if (msg?.type === 'CMD_CAPTURE') {
      captureNow({ manual: true })
        .then(() => widget?.notify('Thread captured'))
        .catch(() => widget?.notify('Nothing to capture here', true));
    }
    if (msg?.type === 'SETTINGS_CHANGED') {
      settings = { ...settings, ...(msg.payload || {}) };
      widget?.setVisible(settings.widgetEnabled !== false);
    }
  });

  async function init() {
    settings = await send('GET_SETTINGS').catch(() => settings);
    await mountWidget();
    startLimitWatcher();
    watchThreadChanges();
    // Start handoff check immediately (no delay)
    await applyPendingHandoff();
    // Reduced initial capture delay
    setTimeout(() => captureNow().catch(() => {}), 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
