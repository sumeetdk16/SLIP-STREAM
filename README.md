<div align="center">
<img src="extension/icons/icon128.png" width="96" alt="Slipstream Logo" />

# 🌊 Slipstream

### *Switch AI models without losing speed*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chrome.google.com/webstore)
[![Tests Passing](https://img.shields.io/badge/tests-58%2F58%20passing-brightgreen.svg)](#-testing)
[![Version](https://img.shields.io/badge/version-1.0.0-orange.svg)](package.json)

**A Chrome extension that carries your AI conversation context seamlessly across platforms.**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Platforms](#-supported-platforms) • [Documentation](#-documentation)

---

</div>

## 🚀 Overview

Slipstream is a Manifest V3 Chrome extension that captures your live AI conversation and intelligently hands it off to another assistant—so you never lose context when switching models.

**ChatGPT** • **Claude** • **Gemini** • **Copilot** • **Grok** • **Perplexity**

### The Problem

You're deep in a conversation with an AI assistant. Then you hit a usage cap, need a different model for the next step, or want a second opinion. You switch assistants... and the new one knows nothing:
- ❌ The original goal
- ❌ Decisions already made  
- ❌ Constraints discussed three messages ago
- ❌ Context built over 20+ turns

**Result**: You waste 3-4 messages re-explaining everything. Every. Single. Time.

### The Slipstream Solution

Slipstream solves this with intelligent context relay:

#### 🎯 **Captures Automatically**
Real message nodes from the page — roles intact, saved as the conversation grows. No manual copy-paste.

#### 🧠 **Compresses Intelligently**  
Uses GPT-OSS 120B on Groq to create a five-section handoff brief:
```
CONTEXT / ESTABLISHED / CONSTRAINTS / STATE / NEXT
```
Generated in <1 second on Groq's free tier.

#### 🚀 **Carries Seamlessly**
Pick a destination → Slipstream opens it, finds the composer, types the brief. You review and send.

#### ⚠️ **Detects Limits**
Watches for usage cap messages, captures your thread the moment you're cut off, and suggests handoff destinations immediately.

#### ✨ **Enhances Prompts**
Pull what's in the composer, rewrite it with AI for precision, write it back — with one-click undo.

> **Works without API key**: Handoffs fall back to trimmed transcripts (opening + final turns) when no Groq key is configured.

---

## ✨ Features

### Core Features

| Feature | Description |
|---------|-------------|
| 🔄 **Auto-Capture** | Conversations captured automatically with intelligent debouncing |
| 🤖 **AI Compression** | Context compressed into structured handoff briefs via Groq |
| 🚨 **Limit Detection** | Automatically detects usage caps and suggests alternatives |
| ⚡ **One-Click Handoffs** | Switch assistants without re-explaining anything |
| ✍️ **Prompt Enhancement** | Rewrite prompts for clarity and precision (with undo) |
| 📚 **Thread History** | Last 40 conversations saved locally |
| 🎹 **Keyboard Shortcuts** | `Cmd/Ctrl+Shift+K` (toggle), `Cmd/Ctrl+Shift+S` (capture) |
| 🎨 **Transit UI** | Beautiful, monochrome interface with platform brand colors |
| 🔒 **Privacy-First** | No telemetry, no tracking, local storage only |
| 🌐 **Works Offline** | Graceful fallback when no API key configured |

### 🎯 Supported Platforms

| Platform | URL | Status |
|----------|-----|--------|
| **ChatGPT** | `chatgpt.com` | ✅ Full Support |
| **Claude** | `claude.ai` | ✅ Full Support |
| **Gemini** | `gemini.google.com` | ✅ Full Support |
| **Copilot** | `copilot.microsoft.com` | ✅ Full Support |
| **Grok** | `grok.com`, `x.com/i/grok` | ✅ Full Support |
| **Perplexity** | `perplexity.ai` | ✅ Full Support |

Each platform has custom adapters for:
- ✅ Reading conversation threads (roles + content)
- ✅ Writing to composer (native input events)
- ✅ Detecting usage limit notices

---

## 📦 Installation

There are two ways to install Slipstream. They load **different folders** — mixing them up is the most common mistake.

### Option A: Install from ZIP (Recommended for Users)

1. **Download** `slipstream-<version>.zip` from the [Releases](https://github.com/sumeetdk16/SLIP-STREAM/releases) page
2. **Unzip** the file to a permanent location (e.g., `~/Chrome Extensions/slipstream/`)
3. Open **Chrome** → Navigate to `chrome://extensions`
4. Enable **Developer mode** (toggle in top-right corner)
5. Click **Load unpacked**
6. Select the **unpacked folder** (the one containing `manifest.json`)

✅ Done! The extension is now installed.

> **⚠️ Important**: Do NOT run `npm install` in the ZIP folder. It has no `package.json` — that's expected.

### Option B: Install from Source (For Developers)

```bash
# Clone the repository
git clone https://github.com/sumeetdk16/SLIP-STREAM.git
cd SLIP-STREAM

# Install dev dependencies (jsdom for tests only)
npm install

# Run verification (integrity check + 58 tests)
npm run verify
```

**Load in Chrome:**
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the **`extension/`** folder (NOT the repo root)

**Optional Setup:**
1. The settings page opens on install
2. Get a free API key from [console.groq.com/keys](https://console.groq.com/keys)
3. Paste the key and click **Verify**
4. Close the settings

> **Note**: The extension works without an API key. Handoffs will use trimmed transcripts instead of AI-compressed briefs.

---

## 🎮 Usage

### Quick Start

1. **Visit any supported chat** (ChatGPT, Claude, Gemini, Copilot, Grok, or Perplexity)
2. **Start a conversation** — it captures automatically
3. **Open the widget** with `Cmd+Shift+K` (Mac) or `Ctrl+Shift+K` (Windows/Linux)
4. **Pick a destination** from the list
5. **Review the brief** in the target assistant's composer
6. **Press Send** when ready

### Actions

| What you do | What happens |
|-------------|--------------|
| **Start chatting** | Slipstream captures automatically as the thread grows |
| **Press `Cmd/Ctrl+Shift+S`** | Force immediate capture |
| **Click the widget** | Open destination picker |
| **Pick a platform** | Brief typed into target composer |
| **Review & send** | You control what gets sent (Slipstream never sends for you) |
| **Click "Enhance"** | Rewrite your current prompt with AI (requires Groq key) |
| **Click "Undo"** | Restore your original prompt |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+K` / `Ctrl+Shift+K` | Toggle widget visibility |
| `Cmd+Shift+S` / `Ctrl+Shift+S` | Force capture current thread |

---

## 🛠️ Development

### Project Structure

```
slipstream/
├── extension/              # Chrome extension (load this in chrome://extensions)
│   ├── manifest.json      # MV3 manifest
│   ├── icons/             # Extension icons (16-128px)
│   ├── fonts/             # Outfit variable font (bundled)
│   └── src/
│       ├── background/    # Service worker + Groq API integration
│       ├── content/       # Content scripts, adapters, widget
│       ├── popup/         # Toolbar popup interface
│       ├── options/       # Settings page
│       └── shared/        # Common code (platforms, logos, prompts)
├── web/                   # Landing page (static HTML)
├── test/                  # Test suite (58 tests)
├── scripts/               # Build tooling (check, zip, icons)
└── dist/                  # Build output (created by npm run zip)
```

### Scripts

```bash
npm run check      # Manifest integrity, file references, syntax sweep
npm test           # Run 58 tests (adapters, widget, limits, etc.)
npm run verify     # check + test
npm run zip        # Package extension → dist/slipstream-<version>.zip
npm run deploy     # Deploy landing page to Vercel
```

### Testing

The test suite runs real content scripts in jsdom against fixture markup for each platform:

```bash
npm test
```

**Coverage:**
- ✅ Adapter capture/write for all 6 platforms
- ✅ Limit watcher detection logic
- ✅ Widget rendering and interactions
- ✅ Service worker message handling
- ✅ Prompt generation and budgets
- ✅ Security and permissions

**Result**: 58/58 tests passing ✅

### Making Changes

1. Edit files in `extension/src/`
2. Go to `chrome://extensions`
3. Click **Reload** on the Slipstream card
4. Refresh open chat tabs
5. Test your changes

> Content script changes need tab refresh; service worker changes only need extension reload.

### Adding a Platform

To add support for a new AI assistant:

1. Add entry to `src/shared/platforms.js` (host, selectors, brand colors, limit phrases)
2. Add adapter pair to `src/content/adapters.js` (capture + write functions)
3. Update `manifest.json` (content_scripts matches, host_permissions)
4. Add fixture in `test/adapters.test.js`
5. Run `npm run check` — fails if manifest and registry disagree

---

## 🔧 Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `npm error ENOENT … package.json` | Ran npm inside ZIP folder | Load the folder directly; npm is for the repo only |
| Widget doesn't appear | Wrong folder loaded or unsupported site | Load `extension/` folder; check you're on a supported platform |
| Widget says "partial read" | Host markup changed | Capture fell back to text-only mode — still usable; file an issue |
| Handoff arrives empty | Composer didn't mount in 20s | Brief is on clipboard — paste it manually |
| "Enhance" does nothing | No Groq key or key invalid | Add/verify key in settings page |

**Debug Tips:**
- Check service worker logs: `chrome://extensions` → **service worker** (under Slipstream)
- Reload extension after changes: Click **Reload** on the card
- Refresh chat tabs after content script changes

---

## 🎨 Design

Slipstream uses a **transit interchange metaphor**:
- Each assistant is a **line** (with its own brand color)
- Your context is the **passenger**
- A handoff is a **change of line**

**Design Principles:**
- 🎨 **Monochrome UI** — Black/grey with brand colors for identity only
- ⚪ **White acts** — Primary actions are white surfaces  
- 🔴 **Red = disruption** — Only used for usage limits
- 🚇 **Transit diagrams** — All strokes at 0°, 45°, or 90°
- 📐 **Flat & precise** — No gradients, no glow, hairline structure

See [DESIGN.md](DESIGN.md) for the complete design system specification.

---

## 🔒 Privacy & Security

- ✅ **No telemetry** — Zero tracking, zero analytics
- ✅ **No server** — Except Groq API for context compression
- ✅ **Local storage** — Last 40 threads saved in your browser only
- ✅ **API key security** — Key stored in extension storage, only accessible to service worker
- ✅ **Content script isolation** — Page scripts cannot access your API key
- ✅ **User control** — Export or delete all saved threads anytime
- ✅ **Manifest V3** — Modern, secure extension architecture

**What leaves your browser:**
- Only the conversation you're handing off, sent to Groq for compression
- Only when you click a destination or press "Enhance"
- Never sent anywhere else

---

## 📚 Documentation

- **[README.md](README.md)** — This file (complete user & developer guide)
- **[DESIGN.md](DESIGN.md)** — Design system specification (colors, type, components)
- **[PRODUCT.md](PRODUCT.md)** — Product requirements and truth
- **[QUICKSTART.md](QUICKSTART.md)** — Quick start guide
- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** — Detailed completion status

---

## 🏗️ How It Works

### End-to-End Flow

```
 Chat Page (Content Scripts)         Service Worker              Target Tab
 ───────────────────────────         ──────────────              ──────────
 
 1. MutationObserver fires
    └─ adapters.capture()
       (roles + text + threadKey)
       
 2. CAPTURE_CONTEXT ──────────▶ sanitize → storage.local
                                (newest 40 kept)
                                
 3. You press a destination
    
 4. SEND_HANDOFF ─────────────▶ buildHandoff()
                                ├─ key? Groq → brief
                                └─ none? trimmed transcript
                                
                                queueHandoff()
                                chrome.tabs.create()
                                
                                                    ──▶ 5. main.js loads
                                                        CONSUME_PENDING
                                ◀────────────────────── 
                                
                                                    ──▶ 6. Wait for composer
                                                        adapters.writeComposer()
                                                        
                                                    ──▶ 7. You review & send
```

### Key Components

**1. Adapters** — Platform-specific DOM reading/writing  
Each platform gets custom selectors for message nodes and composer injection.

**2. Capture Loop** — Automatic thread saving with debouncing  
Observes DOM changes, fingerprints threads, only writes when content changes.

**3. Service Worker** — State, compression, and routing  
Handles storage, Groq API calls, and message routing between contexts.

**4. Limit Watcher** — Cheap usage cap detection  
Scans live regions and composer area for platform-specific limit phrases.

---

## 📦 Packaging

Create a distributable ZIP for Chrome Web Store:

```bash
npm run zip
```

Output:
- `dist/slipstream-1.0.0.zip` (89 KB) — Ready for Chrome Web Store
- `web/slipstream-1.0.0.zip` — Copy for landing page download

The ZIP's root *is* the extension — `manifest.json` at top level — which is what both Chrome Web Store and "Load unpacked" expect.

---

## 🌐 Landing Page

Static HTML landing page at `web/index.html`:

```bash
cd web && vercel deploy --prod
# or
npm run deploy
```

Features:
- Interactive transit diagram with animated route
- Download link to extension ZIP
- No build step, no dependencies

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm run verify`)
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **[Groq](https://groq.com)** — Lightning-fast LLM inference
- **[@lobehub/icons-static-svg](https://github.com/lobehub/lobe-icons)** — Assistant logos (MIT)
- **Transit systems worldwide** — Design inspiration

---

## 🔗 Links

- **Repository**: [github.com/sumeetdk16/SLIP-STREAM](https://github.com/sumeetdk16/SLIP-STREAM)
- **Issues**: [github.com/sumeetdk16/SLIP-STREAM/issues](https://github.com/sumeetdk16/SLIP-STREAM/issues)
- **Groq Console**: [console.groq.com](https://console.groq.com)

---

<div align="center">

**Built with ❤️ for AI power users**

*Switch models without losing speed*

</div>
