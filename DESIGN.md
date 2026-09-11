# Slipstream — design system

Written from the built product, not ahead of it. Surfaces: the in-page widget
(`extension/src/content/widget.js`), the popup and settings pages
(`extension/src/shared/ui.css` + each page's own sheet), and the landing page (`web/index.html`).

## The world

A transit interchange. Each assistant is a **line** with its own colour, your context is the
**passenger**, and a handoff is a **change of line**. The metaphor is load-bearing, not decorative:

- Destinations hang off one vertical **trunk**, each marked by a **station** dot — they are all
  reachable from where you are, which is exactly what the trunk says.
- A usage cap is a **service disruption**: a red board, a stop bar, and the alternative lines
  directly beneath it.
- Install steps and the three-stop explainer are drawn as stations on a line, so sequence is
  carried by the diagram instead of by `01 / 02 / 03` labels.

**The rule that keeps it a diagram and not a decoration: every stroke runs at 0°, 45° or 90°.**

## Colour

Warm, not cold. The palette is drawn from two references the user pinned —
[project-os-self.vercel.app](https://project-os-self.vercel.app) (hot orange on near-black) and
[crackalgo.in](https://crackalgo.in) (gold, deep crimson, cream paper).

| Token | Value | Role |
| --- | --- | --- |
| `ink` | `#100c0a` | The ground, everywhere |
| `panel` | `#181310` | Panels and page surfaces |
| `raised` | `#231c17` | Hover fills, inset captions |
| `hair` | `#372c25` | Hairline structure, the trunk |
| `text` | `#fbf6ee` | Body — warm off-white, never pure |
| `dim` | `#bcae9f` | Secondary |
| `faint` | `#93857a` | Micro-labels — the floor that still clears 4.5:1 |
| `live` | `#ff6a00` | **Slipstream's own line.** Primary actions only |
| `amber` | `#ffbe00` | Data emphasis: the thread gauge, brief keys. Never an action |
| `stop` | `#a01520` | Filled disruption boards |
| `flare` | `#d9461a` | Disruption *marks* on the dark ground, where crimson would vanish |
| `cream` | `#f5f0e5` | The one light field — the install band |

Strategy is **Committed**: orange owns whole regions (the primary button, the toast, the live
route) rather than being sprinkled as an accent. The two-tone accent is deliberate and roles never
mix — **orange acts, gold measures.** Dark ground is chosen from the use scene: the widget overlays
someone else's product and must read as an instrument bolted on, not as part of the host page. The
cream band exists so the page has a second material instead of one dark note for its whole length.

**Line colours are the products' real brand hues**, so colour here is always data:
ChatGPT `#10a37f` · Claude `#d97757` · Gemini `#4285f4` · Copilot `#4cc2ff` · Grok `#9aa3af` ·
Perplexity `#20b0c0`. Copilot is lightened from its brand blue so it stays distinguishable from
Gemini on the same map. In the hero, Claude's terracotta is drawn at 50% opacity — it neighbours
the orange route, and the line you have left should recede anyway.

On the crimson board, type is **white**; quoted limit strings sit on a `rgba(0,0,0,.34)` knockout
in `#ffdad3`. On cream, type is `#1a1614` and keyboard keys invert to warm black with amber.

## Type

**Syne** for display, **Outfit** for text and UI, **JetBrains Mono** for data — the three faces the
two reference sites use between them. (Project OS's own display face, Rejouice, and its Gilroy body
are both commercial; Syne is the face that site loads from Google, and Outfit is the closest open
geometric to Gilroy — CrackAlgo already pairs it with JetBrains Mono.)

- **Display — Syne 700/800**, uppercase, `-0.018em`, `line-height: 0.95`. It sets roughly 50% wider
  than a standard grotesk, so the hero headline stacks five lines instead of four; that scale is the
  point, not a defect.
- **Text — Outfit 300–700.** Body runs 16.5px / 1.62 on the landing page, 13px in the extension.
- **Data — JetBrains Mono 400/500** for micro-labels (`CONTEXT`, `YOU`, `STORED`) and literal code.
  Mono is used where it labels data or shows code, never as decoration.
- `font-variant-numeric: tabular-nums` globally; turn counts and timestamps line up.
- Functional text floor is **11px**. Nothing below it.

**The extension ships its own faces.** `extension/fonts/` carries the Syne and Outfit latin variable
subsets (67 KB total), declared `web_accessible_resources` and referenced through
`chrome.runtime.getURL` inside the shadow root. A popup should not wait on a CDN to set its own
type, and where a host page's CSP refuses the font, the fallback stack renders and nothing else
changes.

## Components

- **Station dot** — 12–13px circle, 2.5–3px ring in the line's colour, panel-coloured fill.
  Hover fills it and scales it 1.15 on an ease-out quart.
- **Line bar** — a 15×4px flat rectangle, `border-radius: 1px`. The compact stand-in for a
  station in lists and chips.
- **Trunk** — 2px `hair` vertical rule with the stations sitting on it.
- **Runner** — 2px × 22px `live` segment that travels the trunk on handoff.
- **Switch** — a 2px-radius track that fills with `live`; a line either runs or it does not.
- **Service notice** — the toast slides up from the panel's bottom edge as a full-width flat band,
  `live` for success and `stop` for failure. Not a floating pill.

## Motion

One authored moment per surface, exponential ease-out (`cubic-bezier(.22,1,.36,1)`), from an
already-visible resting state.

- Widget: the runner travelling the trunk.
- Landing page: the yellow route draws once on load, then the passenger token rides it via
  `offset-path` on the same geometry the `<path>` uses.

Nothing animates a layout property. `prefers-reduced-motion` parks the token at 62% of the route
and disables the rest.

## Browser surfaces

Themed, not inherited: `::selection` is `live` on black, `caret-color` is `live`, scrollbar
thumbs are `hair` on the page ground, and focus rings are a 2–3px `live` outline with offset.

## Bans specific to this world

No gradients, no glow, no glass. No cold greys — every neutral carries the ground's warmth. No rounded line caps on diagram strokes (`butt` and `square`
only). No unicode glyph used as an icon — icons are drawn SVG, 2px stroke, square caps, mitred
joins. No card grid where a line would say it better.
