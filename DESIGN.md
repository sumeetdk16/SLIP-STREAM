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

Monochrome. Pitch black ground, a grey scale for structure, and **no hue in the chrome at all**.
The warm near-black-and-orange world this started in is gone; what replaced it is the palette an
instrument panel uses, where nothing is coloured unless the colour means something.

| Token | Value | Role |
| --- | --- | --- |
| `black` | `#000000` | The ground, everywhere |
| `surface` | `#0b0b0b` | Panels and page surfaces |
| `raised` | `#161616` | Hover fills, inset captions |
| `hair` | `#242424` | Hairline structure, the trunk |
| `hair-hi` | `#383838` | Hairline on hover |
| `text` | `#f5f5f5` | Body |
| `dim` | `#a3a3a3` | Secondary, and the resting state of every mark |
| `faint` | `#6e6e6e` | Micro-labels and unlit stations |
| `accent` | `#ffffff` | **White acts.** The primary button, the toast, the live route |
| `on-accent` | `#000000` | Type on a white block |
| `danger` | `#e5484d` | The one hue in the system |
| `danger-dim` | `#ff9ea1` | Alarm text on the dark ground |
| `paper` | `#f2f2f2` | Landing page only: the one light field, the install band |

Two rules carry the whole palette:

**White acts.** A primary button is a solid white block, and it is the only full-strength white
*surface* anywhere on a page. There is never a question which control is the one that does the
thing, and no second accent is needed to say so.

**The red means one thing: this line is closed.** `danger` marks a hit usage cap and nothing else.
It is not used for destructive-but-ordinary actions, not for validation, not for emphasis. Because
it is the only hue in a page of greys, it does not have to be loud to be seen, and it never
competes with anything that is merely important.

Everything else is a grey, and each grey is a level of structure rather than a taste: ground,
surface, raised, hairline. A measurement — the thread gauge — fills in `dim`, which is the one
place a plain grey bar is data rather than a control, because it is never clickable.

## The marks

**Each assistant is identified by its own logo, not by a colour swatch.** The marks are the
monochrome 24×24 paths from [`@lobehub/icons-static-svg`](https://github.com/lobehub/lobe-icons)
(MIT), kept in `extension/src/shared/logos.js` and drawn with `currentColor`, so a single mark
serves every grey on every surface.

That is what makes the monochrome palette work rather than merely survive: identity moved out of
colour and into form, so removing the hues cost the map nothing. A station is now the destination's
own mark sitting on the trunk, `faint` at rest and full `text` on hover — **the line you are about
to take is the lit one**.

The registry still carries each product's brand `color`, unused by the chrome, so a future surface
that genuinely needs the hue as data has it.

## Type

**Outfit** for everything, **JetBrains Mono** for data. The display face is Outfit at 700/800 with
tight tracking rather than a separate characterful face; a single well-cut geometric sans across
display and UI is what reads as professional here, and it removed a whole bundled font.

- **Display — Outfit 700/800**, uppercase where it is a headline, `-0.018em`, `line-height: 0.95`.
- **Text — Outfit 300–700.** Body runs 16.5px / 1.62 on the landing page, 13px in the extension.
- **Data — mono 400/500** for micro-labels (`STATUS`, `SAVED THREADS`), keycaps, hosts and literal
  code. Mono labels data or shows code, never decoration.
- `font-variant-numeric: tabular-nums` globally.
- Functional text floor is **11px**. Nothing below it.

**The extension ships its own face.** `extension/fonts/outfit-var-latin.woff2` (32 KB) is declared
`web_accessible_resources` and referenced through `chrome.runtime.getURL` inside the shadow root.
Where a host page's CSP refuses it, the fallback stack renders and nothing else changes.

## Shape

Three radii, one rule: **the diagram is nearly sharp, controls are 6, surfaces are 10.**

| Token | Value | What gets it |
| --- | --- | --- |
| `r-flat` | `2px` | Anything that reads as a stroke on the map: line bars, the gauge, the switch track, keycaps, inline code |
| `r` | `6px` | Controls: buttons, inputs, chips, list rows, station targets |
| `r-lg` | `10px` | Surfaces: cards, slabs, the launcher |
| `r-band` | `14px` | Landing page only, and only the two full-bleed bands (the closure board, the install paper), where a 10 reads as an accident |

The widget's panel is the single documented exception at `12px`: it is a floating surface on
someone else's page, and at `10px` it read as flush with the host.

Nothing uses any other radius. A line bar rounded to 4 stops being a stroke and starts being a
pill, which is why the flat step exists at all.

## Components

- **Station** — the destination's own 16–18px mark on a surface-coloured pad, sitting on the
  trunk. `faint` at rest; hover brings it to `text` and scales it 1.12 on an ease-out quart.
- **List mark** — the same logo at 14–15px, `dim` at rest and `text` on hover or when active.
  The compact stand-in for a station in lists and chips.
- **Trunk** — 2px `hair` vertical rule with the stations sitting on it.
- **Runner** — 2px × 22px white segment that travels the trunk on handoff.
- **Switch** — a 2px-radius track that fills with `accent`; a line either runs or it does not.
- **Service notice** — the toast slides up from the panel's bottom edge as a full-width flat band,
  White for success and `danger` for failure. Not a floating pill.

## Motion

One authored moment per surface, exponential ease-out (`cubic-bezier(.22,1,.36,1)`), from an
already-visible resting state.

- Widget: the runner travelling the trunk.
- Popup: opening a saved thread draws the trunk down from it and the stations arrive along it.
  The map is built under the thread you picked, which is what the click means.
- Landing page: the route draws once on load, then the passenger token rides it via `offset-path`
  on the same geometry the `<path>` uses.

Nothing animates a layout property. `prefers-reduced-motion` parks the token at 62% of the route
and disables the rest.

## Browser surfaces

Themed, not inherited: `::selection` is white on black, `caret-color` is white, scrollbar
thumbs are `hair` on the page ground, and focus rings are a 2–3px white outline with offset.

## One interchange, drawn twice

The popup and the widget draw the same object, so a destination must not behave differently
between them. Both get the assistant's mark as its station, the raised hover fill, the name that
steps right, and the departure arrow; both report thread length on the same gauge against the same
30-turn scale. Anything added to one is owed to the other.

## Bans specific to this world

No gradients, no glow, no glass. No second accent, and no hue at all in the chrome — if something
needs to stand out, it stands out by being white, by being larger, or by being the only thing
moving. No rounded line caps on diagram strokes (`butt` and `square` only). No unicode glyph used as an icon — interface icons are drawn SVG, 2px stroke, square caps, mitred
joins, and the assistants' marks come from the icon set, never hand-traced. No card grid where a line would say it better.
