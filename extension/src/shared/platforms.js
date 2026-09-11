/**
 * Slipstream — platform registry.
 *
 * Loaded both as the first content script (classic, shares page-agnostic global
 * scope with the other content scripts) and via importScripts() in the service
 * worker, so it must stay dependency-free and assign onto globalThis.
 */
(function (root) {
  'use strict';

  /**
   * limitPatterns are matched case-insensitively against the page's visible
   * text. They are intentionally narrow: a false positive nags the user on
   * every keystroke, so we only match phrasings these products actually ship.
   */
  const PLATFORMS = {
    chatgpt: {
      id: 'chatgpt',
      name: 'ChatGPT',
      vendor: 'OpenAI',
      color: '#10a37f',
      newChatUrl: 'https://chatgpt.com/',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      limitPatterns: [
        "you've reached the current usage cap",
        "you've hit the plus plan limit",
        'you have reached your limit',
        'limit reached for gpt',
        'please try again later or upgrade',
        'message limit reached'
      ]
    },
    claude: {
      id: 'claude',
      name: 'Claude',
      vendor: 'Anthropic',
      color: '#d97757',
      newChatUrl: 'https://claude.ai/new',
      hosts: ['claude.ai'],
      limitPatterns: [
        'you are out of free messages',
        "you've reached your usage limit",
        'message limit reached',
        'your limit will reset at',
        'out of messages until'
      ]
    },
    gemini: {
      id: 'gemini',
      name: 'Gemini',
      vendor: 'Google',
      color: '#4285f4',
      newChatUrl: 'https://gemini.google.com/app',
      hosts: ['gemini.google.com'],
      limitPatterns: [
        "you've reached your limit",
        'limit for this model',
        'try again tomorrow',
        'daily limit reached'
      ]
    },
    copilot: {
      id: 'copilot',
      name: 'Copilot',
      vendor: 'Microsoft',
      color: '#0a68c9',
      newChatUrl: 'https://copilot.microsoft.com/',
      hosts: ['copilot.microsoft.com'],
      limitPatterns: [
        "you've reached your daily limit",
        'daily chat limit',
        'come back tomorrow for more',
        'conversation limit reached'
      ]
    },
    grok: {
      id: 'grok',
      name: 'Grok',
      vendor: 'xAI',
      color: '#8b8b8b',
      newChatUrl: 'https://grok.com/',
      hosts: ['grok.com', 'x.com'],
      limitPatterns: [
        "you've reached your limit of grok",
        'rate limit exceeded',
        'you have reached your grok limit',
        'upgrade to premium to continue'
      ]
    },
    perplexity: {
      id: 'perplexity',
      name: 'Perplexity',
      vendor: 'Perplexity AI',
      color: '#20808d',
      newChatUrl: 'https://www.perplexity.ai/',
      hosts: ['www.perplexity.ai'],
      limitPatterns: ['you have reached your pro search limit', 'out of pro searches']
    }
  };

  /** Ordered list used for pickers and the popup. */
  const PLATFORM_LIST = Object.values(PLATFORMS);

  function platformForHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    for (const p of PLATFORM_LIST) {
      if (p.hosts.some((h) => host === h || host.endsWith('.' + h))) return p;
    }
    return null;
  }

  function platformForUrl(url) {
    try {
      return platformForHost(new URL(url).hostname);
    } catch {
      return null;
    }
  }

  root.SLIPSTREAM_PLATFORMS = PLATFORMS;
  root.SLIPSTREAM_PLATFORM_LIST = PLATFORM_LIST;
  root.slipstreamPlatformForHost = platformForHost;
  root.slipstreamPlatformForUrl = platformForUrl;
})(typeof self !== 'undefined' ? self : globalThis);
