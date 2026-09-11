/**
 * Slipstream — service worker.
 *
 * Owns everything the content scripts must not: the Groq key, persisted
 * contexts, and cross-tab handoff. Content scripts talk to it exclusively
 * through chrome.runtime.sendMessage.
 */
/* global SlipstreamGroq, SlipstreamPrompts, slipstreamPlatformForUrl, SLIPSTREAM_PLATFORMS */

importScripts('/src/shared/platforms.js', '/src/shared/prompts.js', '/src/background/groq.js');

const MAX_CONTEXTS = 40;
const MAX_TRANSCRIPT_CHARS = 14000;

const DEFAULT_SETTINGS = {
  groqApiKey: '',
  model: SlipstreamGroq.DEFAULT_MODEL,
  widgetEnabled: true,
  autoCapture: true,
  limitAlerts: true,
  autoFillTarget: true
};

/* ------------------------------------------------------------------ storage */

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

async function getContexts() {
  const { contexts } = await chrome.storage.local.get('contexts');
  return Array.isArray(contexts) ? contexts : [];
}

async function saveContexts(contexts) {
  await chrome.storage.local.set({ contexts: contexts.slice(0, MAX_CONTEXTS) });
}

/* ---------------------------------------------------------------- capturing */

function transcriptFrom(messages) {
  const lines = messages.map(
    (m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`
  );
  let out = lines.join('\n\n');
  if (out.length > MAX_TRANSCRIPT_CHARS) {
    // Keep the tail: the current state of a thread matters more than its opening.
    out = '[…earlier turns trimmed…]\n\n' + out.slice(-MAX_TRANSCRIPT_CHARS);
  }
  return out;
}

/**
 * Captures replace the previous capture of the same thread rather than piling
 * up — a thread the user keeps working in should appear once, freshly.
 */
async function storeContext(capture) {
  const contexts = await getContexts();
  const threadKey = capture.threadKey || capture.url;
  const existingIdx = contexts.findIndex((c) => (c.threadKey || c.url) === threadKey);

  const entry = {
    id: existingIdx >= 0 ? contexts[existingIdx].id : crypto.randomUUID(),
    platform: capture.platform,
    title: capture.title || 'Untitled thread',
    url: capture.url,
    threadKey,
    messages: capture.messages,
    messageCount: capture.messages.length,
    capturedAt: Date.now(),
    auto: !!capture.auto
  };

  if (existingIdx >= 0) contexts.splice(existingIdx, 1);
  contexts.unshift(entry);
  await saveContexts(contexts);
  return entry;
}

/* ----------------------------------------------------------------- handoffs */

async function buildHandoff({ contextId, targetPlatformId }) {
  const contexts = await getContexts();
  const ctx = contexts.find((c) => c.id === contextId) || contexts[0];
  if (!ctx) throw new Error('Nothing captured yet.');

  const settings = await getSettings();
  const source = SLIPSTREAM_PLATFORMS[ctx.platform];
  const target = SLIPSTREAM_PLATFORMS[targetPlatformId];
  if (!target) throw new Error('Unknown destination.');

  let brief;
  let summarized = false;

  if (settings.groqApiKey) {
    try {
      brief = await SlipstreamGroq.chat({
        apiKey: settings.groqApiKey,
        model: settings.model,
        system: SlipstreamPrompts.HANDOFF_SYSTEM,
        user: SlipstreamPrompts.handoffUser({
          sourcePlatform: source?.name || ctx.platform,
          targetPlatform: target.name,
          title: ctx.title,
          transcript: transcriptFrom(ctx.messages)
        }),
        temperature: 0.2,
        maxTokens: 800
      });
      summarized = true;
    } catch (err) {
      // A failed summary must not block the handoff: fall back to the raw thread.
      brief = SlipstreamPrompts.localBrief(ctx.messages);
      summarized = false;
    }
  } else {
    brief = SlipstreamPrompts.localBrief(ctx.messages);
  }

  const text = SlipstreamPrompts.wrapHandoff({
    brief,
    sourcePlatform: source?.name || ctx.platform,
    targetPlatform: target.name
  });

  return { text, summarized, context: { id: ctx.id, title: ctx.title, platform: ctx.platform } };
}

/** Stores the handoff so the destination tab can pick it up on load. */
async function queueHandoff({ targetPlatformId, text, sourcePlatform }) {
  const { pending } = await chrome.storage.local.get('pending');
  const next = { ...(pending || {}) };
  next[targetPlatformId] = { text, sourcePlatform, createdAt: Date.now() };
  await chrome.storage.local.set({ pending: next });
}

async function consumePending(platformId) {
  const { pending } = await chrome.storage.local.get('pending');
  const entry = pending?.[platformId];
  if (!entry) return null;
  // Stale drops protect against a handoff firing into an unrelated tab days later.
  const fresh = Date.now() - entry.createdAt < 10 * 60 * 1000;
  const next = { ...pending };
  delete next[platformId];
  await chrome.storage.local.set({ pending: next });
  return fresh ? entry : null;
}

async function openTarget(targetPlatformId) {
  const target = SLIPSTREAM_PLATFORMS[targetPlatformId];
  if (!target) throw new Error('Unknown destination.');

  // Reuse an existing tab on that platform when there is one — opening a
  // seventh ChatGPT tab is not a feature.
  const tabs = await chrome.tabs.query({ url: target.hosts.map((h) => `https://${h}/*`) });
  const existing = tabs.find((t) => !t.discarded);
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true, url: target.newChatUrl });
    await chrome.windows.update(existing.windowId, { focused: true });
    return { tabId: existing.id, reused: true };
  }
  const tab = await chrome.tabs.create({ url: target.newChatUrl, active: true });
  return { tabId: tab.id, reused: false };
}

/* ----------------------------------------------------------------- enhancer */

async function enhancePrompt({ raw, platformId, context }) {
  const settings = await getSettings();
  if (!settings.groqApiKey) {
    const err = new Error('Add a Groq API key in Slipstream settings to use the enhancer.');
    err.code = 'no_key';
    throw err;
  }
  const platform = SLIPSTREAM_PLATFORMS[platformId];
  return SlipstreamGroq.chat({
    apiKey: settings.groqApiKey,
    model: settings.model,
    system: SlipstreamPrompts.ENHANCER_SYSTEM,
    user: SlipstreamPrompts.enhancerUser({
      raw,
      platform: platform?.name,
      context: context ? context.slice(0, 2000) : ''
    }),
    temperature: 0.4,
    maxTokens: 700
  });
}

/* ------------------------------------------------------------ broadcasting */

/** Keeps every open chat tab's widget in sync with the options page. */
async function broadcastSettings(settings) {
  const urls = Object.values(SLIPSTREAM_PLATFORMS).flatMap((p) => p.hosts.map((h) => `https://${h}/*`));
  const tabs = await chrome.tabs.query({ url: urls });
  await Promise.all(
    tabs.map((t) =>
      chrome.tabs.sendMessage(t.id, { type: 'SETTINGS_CHANGED', payload: settings }).catch(() => {})
    )
  );
}

/* ------------------------------------------------------------------ routing */

const handlers = {
  async GET_STATE() {
    const [settings, contexts] = await Promise.all([getSettings(), getContexts()]);
    return { settings: { ...settings, groqApiKey: settings.groqApiKey ? '••••' : '' }, contexts };
  },

  async GET_SETTINGS() {
    return getSettings();
  },

  async SET_SETTINGS({ patch }) {
    const next = await setSettings(patch);
    await broadcastSettings(next);
    return next;
  },

  async OPEN_OPTIONS() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },

  async VERIFY_KEY({ apiKey }) {
    await SlipstreamGroq.verifyKey(apiKey);
    return { ok: true };
  },

  async CAPTURE_CONTEXT({ capture }) {
    const entry = await storeContext(capture);
    return { context: { ...entry, messages: undefined } };
  },

  async LIST_CONTEXTS() {
    const contexts = await getContexts();
    return contexts.map((c) => ({ ...c, messages: undefined }));
  },

  async GET_CONTEXT({ id }) {
    const contexts = await getContexts();
    return contexts.find((c) => c.id === id) || null;
  },

  async DELETE_CONTEXT({ id }) {
    const contexts = await getContexts();
    await saveContexts(contexts.filter((c) => c.id !== id));
    return { ok: true };
  },

  async CLEAR_CONTEXTS() {
    await saveContexts([]);
    return { ok: true };
  },

  async BUILD_HANDOFF(payload) {
    return buildHandoff(payload);
  },

  async SEND_HANDOFF({ contextId, targetPlatformId }) {
    const built = await buildHandoff({ contextId, targetPlatformId });
    const settings = await getSettings();
    if (settings.autoFillTarget) {
      await queueHandoff({
        targetPlatformId,
        text: built.text,
        sourcePlatform: built.context.platform
      });
    }
    const opened = await openTarget(targetPlatformId);
    return { ...built, ...opened, queued: settings.autoFillTarget };
  },

  async CONSUME_PENDING({ platformId }) {
    return { entry: await consumePending(platformId) };
  },

  async ENHANCE_PROMPT(payload) {
    return { text: await enhancePrompt(payload) };
  },

  async LIMIT_DETECTED({ platformId }, sender) {
    const settings = await getSettings();
    if (!settings.limitAlerts) return { ok: false };
    if (sender?.tab?.id != null) {
      await chrome.action.setBadgeText({ tabId: sender.tab.id, text: '!' });
      await chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#e5484d' });
    }
    return { ok: true, platformId };
  },

  async CLEAR_BADGE(_payload, sender) {
    if (sender?.tab?.id != null) {
      await chrome.action.setBadgeText({ tabId: sender.tab.id, text: '' });
    }
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown message: ${msg?.type}` });
    return false;
  }
  Promise.resolve(handler(msg.payload || {}, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err), code: err?.code }));
  return true; // async response
});

/* --------------------------------------------------------------- lifecycle */

chrome.runtime.onInstalled.addListener(async (details) => {
  await setSettings({}); // materialise defaults
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html?welcome=1') });
  }
});

chrome.commands?.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !slipstreamPlatformForUrl(tab.url)) return;
  const type = command === 'capture-context' ? 'CMD_CAPTURE' : 'CMD_TOGGLE';
  chrome.tabs.sendMessage(tab.id, { type }).catch(() => {});
});

// A navigation away from a limited thread should drop the badge with it.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
});
