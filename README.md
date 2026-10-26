# Slipstream

A Chrome extension that lets you seamlessly switch conversations between ChatGPT, Claude, Gemini, Grok, and Perplexity—without losing context.

## What it does

- **Auto-captures** your AI conversations in the background
- **One-click handoff** to switch between AI platforms
- **AI-powered summaries** keep context intact when switching (uses Groq)
- **Detects rate limits** and suggests alternatives
- **Enhances prompts** to make them clearer

## How it works

1. Chat with any supported AI (ChatGPT, Claude, Gemini, Grok, Perplexity)
2. Slipstream captures your conversation automatically
3. Hit a rate limit or want to switch? Click the widget
4. Select destination platform → your context transfers over
5. Continue your conversation seamlessly

## Setup

### Install the extension

1. Clone this repo
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → select the `extension` folder

### Add Groq API key (optional but recommended)

1. Get a free API key from [Groq Cloud](https://console.groq.com)
2. Open Slipstream options
3. Paste your key → Save

Without a key, handoffs still work but use raw conversation history instead of smart summaries.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Create distribution zip
npm run zip
```

## Project structure

```
extension/
├── manifest.json              # Extension config
├── src/
│   ├── background/
│   │   └── service-worker.js  # Handles storage, API calls, message routing
│   ├── content/
│   │   ├── main.js            # Captures conversations, applies handoffs
│   │   ├── adapters.js        # Extracts messages from each platform
│   │   ├── widget.js          # Floating UI
│   │   └── limit-watcher.js   # Detects rate limits
│   ├── popup/                 # Extension popup
│   ├── options/               # Settings page
│   └── shared/
│       ├── platforms.js       # Platform definitions
│       └── prompts.js         # AI prompt templates
├── icons/                     # Extension icons
└── fonts/                     # UI fonts

test/                          # Test suite
web/                          # Landing page
scripts/                       # Build scripts
```

## Key features explained

### Auto-capture
Watches the page for changes and captures your conversation every few seconds. Stores up to 40 recent threads locally.

### Handoffs
When you switch platforms:
1. Captures current conversation
2. Sends to Groq for summarization (or uses local fallback)
3. Opens destination platform
4. Auto-fills the context in the composer

### Limit detection
Monitors each platform for rate limit messages. When detected, shows a notification with quick-switch buttons.

### Prompt enhancement
Rewrites rough prompts into clear, structured ones using AI.

## Keyboard shortcuts

- `Cmd/Ctrl + Shift + K` → Toggle widget
- `Cmd/Ctrl + Shift + S` → Manual capture

## Supported platforms

- ChatGPT (chatgpt.com, chat.openai.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- Grok (grok.com, x.com/i/grok)
- Perplexity (perplexity.ai)

## License

See [LICENSE](LICENSE)

---

**Built by Sumeet**
