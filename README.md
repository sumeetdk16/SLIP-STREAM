<div align="center">
<img src="extension/icons/icon128.png" width="72" alt="Slipstream" />

# Slipstream

**Switch models without losing speed.**

A Chrome extension (Manifest V3) that captures the conversation you're in and hands it to
another assistant as a brief it can act on — instead of you re-explaining everything.

ChatGPT · Claude · Gemini · Copilot · Grok · Perplexity

</div>

---

## The problem

You're deep in a thread. Then you hit a usage cap, or the model is wrong for the next step, and
you switch. The new assistant knows nothing: the goal, the decisions already made, the
constraints you set three messages ago — all gone. So you re-prompt. Every switch costs the same
three or four messages.

## What Slipstream does

- **Captures** the live thread from the page — real message nodes, roles intact — and keeps it
  saved as it grows.
- **Compresses** it with LLaMA 3.3 70B on Groq into a five-section handoff brief
  (`CONTEXT / ESTABLISHED / CONSTRAINTS / STATE / NEXT`), in well under a second on the free tier.
- **Carries** it over: pick a line, and Slipstream opens that assistant, finds its composer and
  types the brief in. You read it and press send.
- **Detects usage limits** — it watches for each product's own phrasing, captures the thread the
  moment you're cut off, and offers the handoff right there.
- **Enhances prompts** — pull what's in the composer, rewrite it into something precise, write it
  back, with one-click undo.

Without a Groq key everything still works; handoffs fall back to a trimmed transcript that keeps
the opening turns (the goal) and the final turns (the current state).

---

## Run it

There is no build step and no server. The extension is the source tree — Chrome loads
`extension/` directly, and `npm` is only needed for the checks and tests.

### 1. Get the code

```bash
git clone <your-repo-url> slipstream && cd slipstream
npm install          # jsdom, for the test suite only — the extension itself has no dependencies
npm run verify       # integrity check + 45 tests; confirms the tree is loadable
```

### 2. Load it into Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the **`extension/`** folder — not the repo root.
4. The settings page opens on install. Paste a free key from
   [console.groq.com/keys](https://console.groq.com/keys) and press **Verify** (optional — see
   below), then close it.
5. Open any supported chat (`chatgpt.com`, `claude.ai`, `gemini.google.com`,
   `copilot.microsoft.com`, `grok.com`, `www.perplexity.ai`). The launcher appears in the
   bottom-right corner.

**The key is optional.** With one, handoffs are model-written briefs and **Enhance** works.
Without one, Slipstream still captures, still detects usage caps, and still hands off — using a
trimmed transcript instead of a brief.

### 3. Use it

| Step | What you do |
| --- | --- |
| Capture | Nothing — it captures automatically as the thread grows. <kbd>⌘⇧S</kbd> / <kbd>Ctrl+Shift+S</kbd> forces it. |
| Hand off | Open the widget, pick a destination from the trunk. The target opens with the brief typed in. |
| Send | Read what was typed, then press the target's own send button. Slipstream never sends for you. |
| Enhance | With text in the composer, press **Enhance**. **Undo** restores your original wording. |

| Shortcut | Action |
| --- | --- |
| <kbd>⌘⇧K</kbd> / <kbd>Ctrl+Shift+K</kbd> | Show / hide the widget |
| <kbd>⌘⇧S</kbd> / <kbd>Ctrl+Shift+S</kbd> | Capture the current thread |

### Reloading after a change

Edit a file, then on `chrome://extensions` press **Reload** on the Slipstream card and refresh the
chat tab. Content-script changes need the tab refresh; service-worker changes only need the
reload. Inspect the worker's logs with **service worker** on that same card.

### Troubleshooting

| Symptom | Cause |
| --- | --- |
| No launcher on the page | Wrong folder loaded (must be `extension/`), or the host isn't one of the six. On `x.com` the widget only runs under `/i/grok`. |
| Widget says `partial read` | The host shipped new markup and the adapter's selectors missed; capture fell back to the main column's text. Still usable. |
| Handoff arrives empty | The target's composer didn't mount within 20s. The brief is still on the clipboard — paste it. |
| `Enhance` does nothing | No Groq key, or the key failed verification. Check the settings page. |

### Packaging

```bash
npm run zip      # dist/slipstream-<version>.zip, ready for the Chrome Web Store
```

---

## How it works

### End to end, one handoff

```
 chat page (content scripts)                  service worker                   target tab
 ───────────────────────────                  ──────────────                   ──────────
 MutationObserver fires
   └─ adapters.capture()  ── CAPTURE_CONTEXT ──▶ sanitize → storage.local
      (roles + text + threadKey)                 (newest 40 kept)
 you press a destination
   └─────────────────── SEND_HANDOFF ──────────▶ buildHandoff()
                                                  ├─ key?  Groq → 5-section brief
                                                  └─ none? trimmed transcript
                                                 queueHandoff() → storage `pending`
                                                 chrome.tabs → open/focus target ──▶ main.js loads
                                                 ◀── CONSUME_PENDING ──────────────── applyPendingHandoff()
                                                                                      waits ≤20s for composer
                                                                                      adapters.writeComposer()
                                                                                      you press send
```

### The four moving parts

**1. Adapters — reading a thread you don't own.** Every chat UI marks its turns up differently,
so each platform gets its own read strategy, its own composer strategy, and its own limit
phrasings (`platforms.js` + `adapters.js`). A capture is `{ platform, threadKey, title, messages:
[{ role, text }] }`. When selectors miss entirely — these products ship new markup often —
capture degrades to the main column's text and is flagged `partial read` in the widget rather
than failing.

| Platform | Turns read from | Composer | Thread key |
| --- | --- | --- | --- |
| ChatGPT | `[data-message-author-role]` | ProseMirror | `/c/:id` |
| Claude | `[data-testid="user-message"]`, `.font-claude-message` | ProseMirror | `/chat/:id` |
| Gemini | `<user-query>` / `<model-response>` | Quill | `/app/:id` |
| Copilot | `[data-content="user-message" \| "ai-message"]` | `textarea` | pathname |
| Grok | `.message-bubble` + row alignment | `textarea` | pathname |
| Perplexity | `[id^="markdown-content"]`, `.prose` | `textarea` | pathname |

Writing is the harder half. A rich-text composer (ProseMirror, Quill) ignores a plain
`value =` assignment, so the adapter dispatches the input events the framework actually listens
for; a `textarea` is set through the native value setter so React sees the change.

**2. Capture loop — saving without hammering storage.** `main.js` observes `main` (or `body`) and
debounces 4s after the last mutation. Each capture is fingerprinted
(`threadKey | message count | last message length`), and an unchanged fingerprint never reaches
the worker. These apps are SPAs, so `pushState` / `replaceState` are wrapped and `popstate`
listened to — a history change, not a load, is what moves you between threads; on one, the
fingerprint resets and any limit banner clears.

**3. Service worker — state, compression, routing.** One `handlers` map, one message envelope
(`{ type, payload }` → `{ ok, data | error }`). It owns everything persistent:

| Message | From | Does |
| --- | --- | --- |
| `CAPTURE_CONTEXT` | content | Sanitize (≤400 messages, ≤20k chars each) and store |
| `LIST_CONTEXTS` / `GET_CONTEXT` / `DELETE_CONTEXT` / `CLEAR_CONTEXTS` | all | Thread history |
| `BUILD_HANDOFF` | content | Brief only, for preview and clipboard |
| `SEND_HANDOFF` | content | Build, queue, open the target tab |
| `CONSUME_PENDING` | content | Hand the queued brief to a freshly-loaded target — once |
| `ENHANCE_PROMPT` | content | Rewrite what's in the composer |
| `LIMIT_DETECTED` / `CLEAR_BADGE` | content | The red `!` toolbar badge |
| `GET_SETTINGS` / `SET_SETTINGS` / `VERIFY_KEY` | popup, options | Settings; writes rejected from a page |

Storage is `chrome.storage.local` only: `contexts` (newest 40), `settings`, and `pending` — a
one-shot queue keyed by target platform, so a brief is delivered to exactly one tab and then
dropped.

**4. Limit watcher — cheap detection.** Each platform declares its own cap phrasings. Scanning a
long thread in full is prohibitively expensive, so the watcher reads only live regions,
`role="alert"` / `role="status"` nodes, elements that name a limit, and the block wrapping the
composer — debounced to one scan every 2.5s. On a hit it captures *first* (the thread you want to
rescue is the one that just got cut off), then raises the disruption state in the widget.

### Three decisions worth calling out

**The key never reaches a content script.** Chat pages run their own JavaScript in the same origin
as the content script's DOM access. All Groq calls go through the service worker, which is the
only context that reads `groqApiKey` — and `SET_SETTINGS` / `VERIFY_KEY` reject any sender that
isn't the popup or the options page.

**The widget lives in a shadow root.** All six host pages ship aggressive global CSS; a closed
style boundary is the only way the widget renders identically on every one of them.

**Nothing is ever sent for you.** Slipstream fills the composer and stops. The brief is on screen,
editable, before a single token leaves for the new model.

### Layout

```
extension/
├── manifest.json                  MV3: content scripts, commands, host permissions
├── src/
│   ├── shared/
│   │   ├── platforms.js           Platform registry — hosts, selectors, brand hues, limit phrasings
│   │   ├── logos.js               Monochrome 24×24 assistant marks (lobe-icons, MIT)
│   │   ├── prompts.js             Handoff + enhancer prompts, offline fallback brief
│   │   └── ui.css                 Shared chrome for popup and options
│   ├── background/
│   │   ├── service-worker.js      Storage, handoff queue, message router
│   │   └── groq.js                The only place the API key is ever read
│   ├── content/
│   │   ├── adapters.js            Per-platform DOM read + composer write
│   │   ├── limit-watcher.js       Targeted scan for usage-cap notices
│   │   ├── widget.js              Floating UI, in a shadow root
│   │   └── main.js                Orchestration, SPA navigation, handoff fill
│   ├── popup/                     Toolbar popup
│   └── options/                   Settings, key verification, export
└── icons/                         Generated by scripts/make_icons.py
```

---

## Design

The whole product is drawn as a transit interchange. Each assistant is a line, your context is
the passenger, and a handoff is a change of line.

- The widget's destination list is one vertical **trunk** with a **station** per assistant — not a
  grid of cards. Starting a handoff sends a token down that trunk to the station you picked, which
  is the motion the product actually performs.
- A hit usage cap is a **service disruption**: a red board in the panel, a stop bar across the
  launcher, and the destinations sitting right underneath it.
- **The chrome is monochrome.** Pitch-black ground, a grey scale for structure, no hue anywhere in
  the furniture. **White acts** — a primary button is the only full-strength white surface on a
  page. **One red (`#e5484d`) means one thing: this line is closed.**
- The exception that earns the greys: **colour names the line.** Each assistant is identified by
  its own real logo, drawn in `currentColor`, and its real brand hue comes up into its name on
  hover or when you're on it. So a hue always answers *which assistant*, never *is this
  important*.
- Outfit for everything, JetBrains Mono for data, on one six-step scale. Outfit is bundled
  (variable, one file) rather than loaded from a CDN, so a popup never waits on the network.
- Flat fills, hairline structure, square-capped icons at one stroke weight, no glow and no
  gradients. **Every stroke runs at 0°, 45° or 90°** — the rule that makes a transit diagram read
  as a diagram.

`DESIGN.md` is the contract: it records the tokens and the rules. `PRODUCT.md` records what the
product is.

---

## Development

```bash
npm run check    # manifest integrity, file references, host coverage, syntax sweep
npm test         # 45 tests: adapters and widget in jsdom, limit matching, prompt budgets
npm run verify   # both
npm run zip      # dist/slipstream-<version>.zip
```

Tests run the real content scripts inside jsdom against fixture markup for each platform, so an
adapter that stops finding turns or a composer fails the suite rather than failing silently in the
browser. **Adding a platform** is: an entry in `platforms.js`, a read/write pair in `adapters.js`,
the hosts in `manifest.json` (matches, host permissions, web-accessible fonts), and a fixture in
`test/adapters.test.js` — `npm run check` fails if the manifest and the registry disagree.

## Privacy

- Captured threads live in this browser's local extension storage. The last 40 are kept; they are
  never synced, and the options page exports or deletes all of them.
- The only outbound request is to `api.groq.com`, carrying the thread you are handing off — and
  only when you press a destination or **Enhance**.
- There is no Slipstream server. No analytics, no accounts, no telemetry.

## Landing page

`web/index.html` is a single dependency-free static file — the interchange diagram in the hero is
inline SVG, and the token rides the real route with a CSS motion path. Open it directly in a
browser to view it; deploy with:

```bash
cd web && vercel deploy --prod
```

## Licence

MIT
