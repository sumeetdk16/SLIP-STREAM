# Slipstream — product truth

_Written from the working build and this session's confirmed answers. Items marked (assumed) were
inferred from the brief, not stated by the user._

## What it is

A Chrome extension (Manifest V3) that carries an in-progress AI conversation from one assistant to
another. It captures the live thread from the page, compresses it into a five-part handoff brief
(`CONTEXT / ESTABLISHED / CONSTRAINTS / STATE / NEXT`) with LLaMA 3.3 70B on Groq, opens the
destination assistant, and types the brief into its composer.

Formerly named ContextBridge, then Continuum. Renamed to **Slipstream** on 2026-09-11.

## The unique mechanism

It reads the *live DOM of six different chat products* — ChatGPT, Claude, Gemini, Copilot, Grok,
Perplexity — with a purpose-built adapter each, so the context that moves is the real conversation,
not a copy-paste. Nothing else sits between the six assistants at the page level.

## Who uses it, and where

Developers and heavy AI users with four chat tabs open at once, mid-task, usually at a desk, often
having just been cut off by a usage cap. (assumed: desk, daytime, multi-tab.) The moment of use is
an interruption — the user is annoyed and wants to keep moving, not to admire an interface.

## The tagline the user chose

"Switch models without losing speed."

## Surfaces

| Surface | Mode | Job |
| --- | --- | --- |
| In-page widget (shadow DOM, all six hosts) | Operate | Capture, pick a destination, enhance a prompt — without leaving the thread |
| Toolbar popup | Operate | Saved threads, per-thread destination picker, three toggles |
| Settings page | Operate | Groq key + verification, behaviour toggles, export/delete |
| Landing page (`web/index.html`) | Persuade | Convince a developer to load it unpacked and star the repo |

## What must remain true

- The widget overlays someone else's product. It can never obscure the composer, the send button,
  or the conversation, and must read identically on six different host stylesheets.
- Everything works with no Groq key; the brief falls back to a trimmed transcript.
- No server, no accounts, no telemetry. The only outbound request is to `api.groq.com`.
- Captured threads stay in local extension storage, 40 max, exportable and deletable.

## What would make a polished result feel wrong

A widget that feels like an ad, a chat UI, or a second assistant. It is an instrument bolted onto a
page that already belongs to someone else, and it has to earn every pixel it covers.

## Constraints

- No build step, no runtime dependencies, no external requests from the extension except Groq.
- MV3 CSP: no inline event handlers, no remote scripts, no `eval`.
- The widget's entire visual world ships as a CSS string inside a shadow root.
