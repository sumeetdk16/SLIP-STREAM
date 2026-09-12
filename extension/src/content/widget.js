/**
 * Slipstream — floating widget.
 *
 * Visual world: a transit interchange. Each assistant is a line with its own
 * colour, the destinations hang off one vertical trunk as stations, and a
 * handoff is a token running down that trunk to the station you picked.
 *
 * Everything lives inside a shadow root: these host pages ship aggressive
 * global CSS, and a closed style boundary is the only way the widget looks the
 * same on all six of them. Host CSP blocks remote fonts in an injected overlay,
 * so the display voice here is weight and tracking, not a downloaded face.
 */
/* global SLIPSTREAM_PLATFORM_LIST, slipstreamLogo */
(function (root) {
  'use strict';

  const HOST_ID = 'slipstream-root';
  const EDGE_MARGIN = 18;
  const TRUNK_X = 15;

  /**
   * The faces ship with the extension. They are declared inside the shadow
   * root with runtime URLs; where a host page's CSP refuses them, the fallback
   * stack renders and nothing else changes.
   */
  function fontFaces() {
    const url = (file) => {
      try {
        return chrome.runtime.getURL('fonts/' + file);
      } catch {
        return '';
      }
    };
    const outfit = url('outfit-var-latin.woff2');
    if (!outfit) return '';
    return `
    @font-face { font-family: "Outfit"; src: url("${outfit}") format("woff2"); font-weight: 100 900; font-display: swap; }
    `;
  }

  const STYLES = `
  :host { all: initial; }
  *, *::before, *::after { box-sizing: border-box; }

  .layer {
    position: fixed;
    z-index: 2147483000;
    right: var(--ss-right, 18px);
    bottom: var(--ss-bottom, 18px);
    font-family: var(--ss-ui);
    font-size: var(--ss-t-body);
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "lnum" 1, "cv01" 1;
    color: var(--ss-text);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;

    --ss-ink: #000000;
    --ss-panel: #0b0b0b;
    --ss-raised: #161616;
    --ss-hair: #242424;
    --ss-hair-hi: #383838;
    --ss-text: #f5f5f5;
    --ss-dim: #a3a3a3;
    --ss-faint: #6e6e6e;
    /* White acts. The panel floats on someone else's page, so the one
       full-strength white surface in it is the control that does the thing. */
    --ss-live: #ffffff;
    --ss-live-hi: #ffffff;
    --ss-on-live: #000000;
    /* The only hue in the system, and it means one thing: this line is closed.
       A filled board takes the darker red so white type clears 4.5:1 on it;
       a *mark* on the black ground takes the brighter one so it is seen. */
    --ss-stop: #b52126;
    --ss-flare: #e5484d;

    /* Same three-step scale as the popup: diagram nearly sharp, controls 6,
       surfaces 10. The panel is the one surface that earns 12. */
    --ss-r-flat: 2px;
    --ss-r: 6px;
    --ss-r-lg: 10px;

    --ss-ui: "Outfit", ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
    --ss-display: "Outfit", ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
    --ss-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;

    /* Colour names the line: each assistant's real brand hue rides its own
       mark, and comes up into its name when that is the line you are hovering
       or already on. Every other piece of type stays on the grey scale. Set
       per row from the registry. */
    --ss-tint: var(--ss-dim);

    /* Type scale, the same six steps the popup uses. */
    --ss-t-micro: 11px;
    --ss-t-small: 11.5px;
    --ss-t-body: 13px;
    --ss-t-mid: 14.5px;
    --ss-track-micro: .14em;
    --ss-track-tight: -.012em;
  }

  ::selection { background: var(--ss-live); color: var(--ss-on-live); }

  /* ---------------------------------------------------------- launcher */
  .launcher {
    width: 46px; height: 46px;
    border-radius: var(--ss-r-lg);
    border: 1px solid var(--ss-hair);
    background: var(--ss-ink);
    display: grid; place-items: center;
    cursor: grab;
    position: relative;
    overflow: hidden;
    flex: none;
    transition: transform .16s cubic-bezier(.2,.8,.3,1), border-color .16s ease;
  }
  .launcher:hover { transform: translateY(-2px); border-color: var(--ss-live); }
  .launcher:active { cursor: grabbing; transform: translateY(0); }
  .launcher.dragging { transition: none; }
  .launcher svg { width: 26px; height: 26px; display: block; }

  /* A hit limit shows the way a closed line does on a map: a stop bar. */
  .pip {
    position: absolute; left: 0; right: 0; bottom: 0;
    height: 5px; background: var(--ss-flare);
    transform: scaleX(0); transform-origin: left;
    transition: transform .22s cubic-bezier(.2,.9,.3,1);
  }
  .pip.on { transform: scaleX(1); animation: blink 1.6s steps(1) infinite .3s; }
  @keyframes blink { 0%, 70% { opacity: 1; } 71%, 100% { opacity: .35; } }

  /* ------------------------------------------------------------- panel */
  .panel {
    width: 348px;
    max-height: min(78vh, 660px);
    background: var(--ss-panel);
    border: 1px solid var(--ss-hair);
    border-radius: 12px;
    /* Warm-tinted: a neutral black drop reads as a hole cut in the host page. */
    box-shadow: 0 18px 50px -12px rgba(12,7,4,.78), 0 4px 12px -4px rgba(12,7,4,.6);
    overflow: hidden;
    display: none;
    flex-direction: column;
    position: relative;
    transform-origin: bottom right;
  }
  .panel.open { display: flex; animation: rise .2s cubic-bezier(.2,.9,.3,1); }
  @keyframes rise {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }

  header {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 13px;
    background: var(--ss-ink);
    border-bottom: 1px solid var(--ss-hair);
  }
  .wordmark {
    font-family: var(--ss-display);
    font-size: 13px; font-weight: 700;
    letter-spacing: .1em; text-transform: uppercase;
    color: var(--ss-text);
  }
  header .mark { width: 19px; height: 19px; display: block; flex: none; }
  header .spacer { flex: 1; }

  /* the line you are currently riding */
  .now { display: inline-flex; align-items: center; gap: 7px; }
  .now .logo { display: grid; place-items: center; flex: none; color: var(--ss-tint); }
  .now .logo svg { display: block; }
  .now .lbl { font-size: var(--ss-t-small); font-weight: 600; color: var(--ss-tint); white-space: nowrap; letter-spacing: var(--ss-track-tight); }

  .iconbtn {
    width: 24px; height: 24px; border-radius: var(--ss-r);
    border: 0; background: transparent; padding: 0;
    color: var(--ss-faint); cursor: pointer; display: grid; place-items: center;
    transition: color .14s, background .14s;
  }
  .iconbtn:hover { background: var(--ss-raised); color: var(--ss-text); }
  .iconbtn svg { width: 14px; height: 14px; display: block; }
  .iconbtn:focus-visible, .target:focus-visible, .btn:focus-visible,
  textarea:focus-visible, .hitem:focus-visible {
    outline: 2px solid var(--ss-live); outline-offset: 2px;
  }

  .body { overflow-y: auto; overscroll-behavior: contain; padding: 14px 13px 16px; scrollbar-width: thin; scrollbar-color: var(--ss-hair) transparent; }
  .body::-webkit-scrollbar { width: 9px; }
  .body::-webkit-scrollbar-thumb { background: var(--ss-hair); border: 3px solid var(--ss-panel); border-radius: 99px; }

  .slot:empty { display: none; }
  .slot + .slot { margin-top: 20px; }

  .label {
    font-family: var(--ss-mono);
    font-size: 11px; font-weight: 500;
    letter-spacing: .14em; text-transform: uppercase;
    color: var(--ss-faint); margin-bottom: 10px;
    display: flex; align-items: baseline; gap: 8px;
  }
  .label .count {
    font-family: var(--ss-ui);
    letter-spacing: 0; text-transform: none; font-weight: 500; font-size: 11px; color: var(--ss-faint);
  }

  /* --------------------------------------------------------- thread */
  .thread { display: grid; grid-template-columns: 14px 1fr; gap: 11px; align-items: start; }
  .thread .stn {
    width: 15px; height: 15px;
    display: grid; place-items: center;
    color: var(--ss-tint);
    margin-top: 3px; flex: none;
  }
  .thread .stn svg { display: block; }
  .thread .title {
    font-size: 14.5px; font-weight: 600; letter-spacing: -.012em; color: var(--ss-text);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .thread .meta { font-size: 11.5px; color: var(--ss-dim); margin-top: 2px; }
  .thread .meta .warn { color: var(--ss-text); }

  /* thread length as a line-fill, butt ends, no rounding */
  .gauge { height: 4px; background: var(--ss-hair); border-radius: var(--ss-r-flat); margin-top: 11px; overflow: hidden; }
  .gauge i {
    display: block; height: 100%; width: 100%; background: var(--ss-dim);
    transform-origin: left; transform: scaleX(0);
    transition: transform .45s cubic-bezier(.22,1,.36,1);
  }

  /* ------------------------------------------------------- interchange */
  .lines { position: relative; padding-left: 0; }
  .trunk {
    position: absolute; left: ${TRUNK_X}px; top: 14px; bottom: 14px;
    width: 2px; background: var(--ss-hair);
  }
  .runner {
    position: absolute; left: ${TRUNK_X}px; width: 2px; height: 22px;
    background: var(--ss-live); top: 0;
    opacity: 0; transform: translateY(0);
    transition: transform .5s cubic-bezier(.5,0,.2,1), opacity .16s ease;
  }
  .runner.go { opacity: 1; }

  .target {
    position: relative;
    display: flex; align-items: center; gap: 11px;
    width: 100%; padding: 8px 10px 8px 32px;
    border: 0; border-radius: var(--ss-r); background: transparent;
    color: var(--ss-text); font: inherit; font-size: 13.5px; font-weight: 550;
    text-align: left; cursor: pointer;
    transition: background .14s ease;
  }
  .target .tname { transition: transform .18s cubic-bezier(.22,1,.36,1), color .14s; }
  /* The station is the destination's own mark, sitting on the trunk. Grey
     until you hover it, then full white: the line you are about to take. */
  .target .stn {
    position: absolute; left: ${TRUNK_X - 8}px; top: 50%; margin-top: -9px;
    width: 18px; height: 18px;
    display: grid; place-items: center;
    background: var(--ss-panel);
    color: var(--ss-tint);
    transition: transform .18s cubic-bezier(.22,1,.36,1);
  }
  .target .stn svg { display: block; }
  .target .go { margin-left: auto; color: var(--ss-faint); display: grid; place-items: center; opacity: 0; transform: translateX(-4px); transition: opacity .14s, transform .14s; }
  .target .go svg { width: 13px; height: 13px; display: block; }
  .target:hover:not(:disabled) { background: var(--ss-raised); }
  /* The destination you are about to take says so in its own colour. */
  .target:hover:not(:disabled) .tname { transform: translateX(3px); color: var(--ss-tint); }
  .target:hover:not(:disabled) .stn { transform: scale(1.12); }
  .target:hover:not(:disabled) .go { opacity: 1; transform: none; }
  .target:disabled { color: var(--ss-faint); cursor: default; }
  /* A line you cannot take is drained of its colour. */
  .target:disabled .stn { color: var(--ss-hair-hi); }
  .target.busy { background: var(--ss-raised); }
  .target.busy .tname { transform: translateX(3px); }
  .target.busy .tname { color: var(--ss-tint); }
  .target .eta { font-family: var(--ss-mono); font-size: 10.5px; color: var(--ss-dim); font-weight: 500; letter-spacing: .04em; }

  /* ------------------------------------------------------------ buttons */
  .row { display: flex; gap: 8px; }
  .btn {
    flex: 1; padding: 9px 12px;
    border-radius: var(--ss-r); border: 1px solid var(--ss-hair);
    background: transparent; color: var(--ss-text);
    font: inherit; font-size: 12.5px; font-weight: 600;
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    transition: background .14s, border-color .14s, color .14s, transform .1s;
  }
  .btn:hover:not(:disabled) { background: var(--ss-raised); border-color: var(--ss-hair-hi); }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn:disabled { color: var(--ss-faint); cursor: default; }
  .btn svg { width: 13px; height: 13px; display: block; flex: none; }
  .btn.primary {
    background: var(--ss-live); border-color: var(--ss-live); color: var(--ss-on-live); font-weight: 700;
  }
  .btn.primary:hover:not(:disabled) { background: var(--ss-live-hi); border-color: var(--ss-live-hi); }
  .btn.primary:disabled { background: transparent; border-color: var(--ss-hair); color: var(--ss-faint); }
  .btn.icon-only { flex: none; width: 38px; padding: 9px 0; }

  /* ----------------------------------------------------------- enhancer */
  textarea {
    width: 100%; min-height: 76px; max-height: 190px; resize: vertical;
    padding: 10px 11px; border-radius: var(--ss-r);
    background: var(--ss-ink); border: 1px solid var(--ss-hair); color: var(--ss-text);
    font-family: inherit; font-size: 13px; line-height: 1.55;
    caret-color: var(--ss-live); outline: none;
    transition: border-color .14s;
    scrollbar-width: thin; scrollbar-color: var(--ss-hair) transparent;
  }
  textarea:focus { border-color: var(--ss-live); }
  textarea::placeholder { color: var(--ss-faint); }

  .hint { font-size: 11px; color: var(--ss-faint); margin-top: 9px; line-height: 1.5; }
  .hint kbd {
    font-family: var(--ss-mono); font-size: 10px; font-weight: 500;
    padding: 1px 5px; border-radius: var(--ss-r-flat);
    background: var(--ss-raised); border: 1px solid var(--ss-hair); color: var(--ss-dim);
  }

  /* -------------------------------------------------- disruption notice */
  .banner {
    display: none; align-items: flex-start; gap: 10px;
    padding: 11px 12px; background: var(--ss-stop);
    color: #fff; margin-bottom: 18px; border-radius: var(--ss-r);
  }
  .banner.on { display: flex; }
  .banner .ico { flex: none; margin-top: 1px; }
  .banner .ico svg { width: 16px; height: 16px; display: block; }
  .banner b { display: block; font-family: var(--ss-display); font-size: 13.5px; font-weight: 700; letter-spacing: -.005em; }
  .banner p { margin: 1px 0 0; font-size: 12px; font-weight: 500; color: #ffdcdd; }
  .banner .iconbtn { color: #ffdcdd; }
  .banner .iconbtn:hover { background: rgba(0,0,0,.28); color: #fff; }

  /* ------------------------------------------------------------ history */
  .history { display: flex; flex-direction: column; }
  .hitem {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 9px; border: 0; border-radius: var(--ss-r); background: transparent;
    cursor: pointer; text-align: left; width: 100%; color: inherit; font: inherit;
    transition: background .14s;
  }
  .hitem:hover { background: var(--ss-raised); }
  .hitem.active { background: var(--ss-raised); }
  .hitem .logo { display: grid; place-items: center; flex: none; color: var(--ss-tint); }
  .hitem .logo svg { display: block; }
  .hitem .t { transition: color .14s; }
  .hitem:hover .t, .hitem.active .t { color: var(--ss-tint); }
  .hitem .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
  .hitem.active .t { font-weight: 650; }
  .hitem .n { font-family: var(--ss-mono); font-size: 10.5px; color: var(--ss-faint); flex: none; }

  .empty {
    font-size: 12px; color: var(--ss-faint); padding: 14px 12px;
    background: var(--ss-ink); border-radius: var(--ss-r); line-height: 1.55;
  }

  /* ------------------------------------------------- service notice bar */
  .toast {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 11px 14px;
    background: var(--ss-live); color: var(--ss-on-live);
    font-size: 12.5px; font-weight: 600;
    display: flex; align-items: center; gap: 9px;
    transform: translateY(101%);
    transition: transform .24s cubic-bezier(.2,.9,.3,1);
  }
  .toast.on { transform: none; }
  .toast.err { background: var(--ss-stop); color: #fff; }
  .toast .ico { flex: none; display: grid; place-items: center; }
  .toast .ico svg { width: 14px; height: 14px; display: block; }

  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
  `;

  /* ------------------------------------------------------------- helpers */

  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) el.appendChild(c);
    return el;
  }

  const stroke = (paths, w = 2) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${paths}</svg>`;

  /** One drawn icon family: square caps, mitred joins, 2px stroke. */
  const ICONS = {
    // the lane change, flat, at two weights of the same geometry
    mark: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 17h20" stroke="#3a3a3a" stroke-width="2.4" stroke-linecap="butt"/>
      <path d="M2 17h4.6l7-10H22" stroke="#ffffff" stroke-width="3.4" stroke-linecap="butt" stroke-linejoin="miter"/></svg>`,
    close: stroke('<path d="M18 6 6 18M6 6l12 12"/>'),
    settings: stroke('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><path d="M14 4v6M6 14v6"/>'),
    capture: stroke('<path d="M4 12h5l3-5h8"/><path d="M17 4l3 3-3 3"/>'),
    copy: stroke('<path d="M8 8h12v12H8z"/><path d="M16 8V4H4v12h4"/>'),
    spark: stroke('<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><path d="m6.5 6.5 3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3"/>'),
    warn: stroke('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>'),
    undo: stroke('<path d="M4 8h11a5 5 0 0 1 0 10H8"/><path d="M8 4 4 8l4 4"/>'),
    go: stroke('<path d="M5 12h13M13 7l5 5-5 5"/>'),
    check: stroke('<path d="m4 12 5 5L20 6"/>'),
    alert: stroke('<path d="M12 4v9M12 17h.01"/><circle cx="12" cy="12" r="9"/>')
  };

  function timeAgo(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  /* -------------------------------------------------------------- widget */

  function create(options) {
    const {
      platform,
      onCapture,
      onHandoff,
      onEnhance,
      onPreview,
      onOpenSettings,
      onSelectContext,
      onDismissLimit
    } = options;

    const state = {
      open: false,
      capture: null,
      contexts: [],
      selectedId: null,
      limit: null,
      busyTarget: null,
      enhancing: false,
      lastComposerValue: null,
      enhancerDraft: ''
    };

    document.getElementById(HOST_ID)?.remove();
    const host = h('div', { id: HOST_ID });
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(h('style', { text: fontFaces() + STYLES }));

    const layer = h('div', { class: 'layer' });
    shadow.appendChild(layer);
    (document.body || document.documentElement).appendChild(host);

    /* ------------------------------------------------------------ panel */
    const banner = h('div', { class: 'banner' });
    const body = h('div', { class: 'body' });
    const toast = h('div', { class: 'toast' });

    // The line you are riding names itself with its own mark.
    const nowMark = h('span', { class: 'logo', html: slipstreamLogo(platform.id, { size: 15 }) });

    const nowChip = h('span', { class: 'now' }, [
      nowMark,
      h('span', { class: 'lbl', text: platform.name })
    ]);
    nowChip.style.setProperty('--ss-tint', platform.color);

    const panel = h('div', { class: 'panel' }, [
      h('header', {}, [
        h('span', { class: 'mark', html: ICONS.mark }),
        h('span', { class: 'wordmark', text: 'Slipstream' }),
        h('span', { class: 'spacer' }),
        nowChip,
        h('button', {
          class: 'iconbtn',
          title: 'Settings',
          'aria-label': 'Settings',
          html: ICONS.settings,
          onclick: () => onOpenSettings?.()
        }),
        h('button', {
          class: 'iconbtn',
          title: 'Close',
          'aria-label': 'Close Slipstream',
          html: ICONS.close,
          onclick: () => api.hide()
        })
      ]),
      body,
      toast
    ]);

    /* --------------------------------------------------------- launcher */
    const pip = h('span', { class: 'pip' });
    const launcher = h('div', {
      class: 'launcher',
      role: 'button',
      tabindex: '0',
      title: 'Slipstream — carry this thread to another assistant',
      'aria-label': 'Slipstream',
      html: ICONS.mark
    });
    launcher.appendChild(pip);
    launcher.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        api.toggle();
      }
    });

    layer.appendChild(panel);
    layer.appendChild(launcher);

    /* -------------------------------------------------------- dragging */
    let drag = null;
    launcher.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: false, rect: layer.getBoundingClientRect() };
      launcher.setPointerCapture(e.pointerId);
    });
    launcher.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      launcher.classList.add('dragging');
      const right = Math.min(
        Math.max(EDGE_MARGIN, window.innerWidth - drag.rect.right - dx),
        window.innerWidth - drag.rect.width - EDGE_MARGIN
      );
      const bottom = Math.min(
        Math.max(EDGE_MARGIN, window.innerHeight - drag.rect.bottom - dy),
        window.innerHeight - drag.rect.height - EDGE_MARGIN
      );
      layer.style.setProperty('--ss-right', right + 'px');
      layer.style.setProperty('--ss-bottom', bottom + 'px');
    });
    launcher.addEventListener('pointerup', (e) => {
      launcher.classList.remove('dragging');
      const wasDrag = drag?.moved;
      if (wasDrag) {
        chrome.storage?.local.set({
          widgetPos: {
            right: layer.style.getPropertyValue('--ss-right'),
            bottom: layer.style.getPropertyValue('--ss-bottom')
          }
        });
      }
      drag = null;
      launcher.releasePointerCapture?.(e.pointerId);
      if (!wasDrag) api.toggle();
    });

    chrome.storage?.local.get('widgetPos', ({ widgetPos }) => {
      if (widgetPos?.right) layer.style.setProperty('--ss-right', widgetPos.right);
      if (widgetPos?.bottom) layer.style.setProperty('--ss-bottom', widgetPos.bottom);
    });

    /* --------------------------------------------------- service notice */
    let toastTimer;
    function notify(message, isError = false) {
      toast.replaceChildren(
        h('span', { class: 'ico', html: isError ? ICONS.alert : ICONS.check }),
        h('span', { text: message })
      );
      toast.classList.toggle('err', isError);
      toast.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('on'), isError ? 5200 : 3000);
    }

    /* --------------------------------------------------------- sections */

    function renderBanner() {
      banner.classList.toggle('on', !!state.limit);
      if (!state.limit) return;
      banner.replaceChildren(
        h('span', { class: 'ico', html: ICONS.warn }),
        h('div', { style: 'flex:1' }, [
          h('b', { text: `${platform.name} limit reached` }),
          h('p', { text: 'This thread is saved. Change lines below to keep going.' })
        ]),
        h('button', {
          class: 'iconbtn',
          title: 'Dismiss',
          'aria-label': 'Dismiss',
          html: ICONS.close,
          onclick: () => {
            state.limit = null;
            onDismissLimit?.();
            render();
          }
        })
      );
    }

    function threadSection() {
      const cap = state.capture;
      const selected = state.contexts.find((c) => c.id === state.selectedId);

      if (!cap && !selected) {
        return h('section', {}, [
          h('div', { class: 'label' }, [h('span', { text: 'This thread' })]),
          h('div', { class: 'empty', text: 'No conversation on this page yet. Send a message and Slipstream picks it up.' })
        ]);
      }

      const count = cap ? cap.messages.length : selected?.messageCount || 0;
      const title = (cap?.title || selected?.title || 'Untitled thread').trim() || 'Untitled thread';
      const savedAt = selected?.capturedAt;
      // 30 turns is where a thread stops fitting comfortably in one handoff.
      const fill = Math.min(100, Math.round((count / 30) * 100));

      const stn = h('span', { class: 'stn', html: slipstreamLogo(platform.id, { size: 15 }) });
      stn.style.setProperty('--ss-tint', platform.color);

      const meta = h('div', { class: 'meta' }, [
        h('span', { text: `${count} turn${count === 1 ? '' : 's'} · ${savedAt ? 'saved ' + timeAgo(savedAt) : 'not saved yet'}` })
      ]);
      if (cap?.degraded) meta.appendChild(h('span', { class: 'warn', text: ' · partial read' }));

      const gauge = h('div', { class: 'gauge' }, [h('i')]);
      gauge.querySelector('i').style.transform = `scaleX(${fill / 100})`;

      return h('section', {}, [
        h('div', { class: 'label' }, [h('span', { text: 'This thread' })]),
        h('div', { class: 'thread' }, [
          stn,
          h('div', { style: 'min-width:0' }, [
            h('div', { class: 'title', title, text: title }),
            meta,
            gauge
          ])
        ]),
        h('div', { class: 'row', style: 'margin-top:12px' }, [
          h('button', {
            class: 'btn',
            html: ICONS.capture + '<span>Re-capture</span>',
            onclick: async () => {
              await onCapture?.({ manual: true });
              notify('Thread captured');
            }
          }),
          h('button', {
            class: 'btn',
            html: ICONS.copy + '<span>Copy brief</span>',
            onclick: () => onPreview?.()
          })
        ])
      ]);
    }

    /**
     * The interchange: one trunk, a station per destination. The runner is the
     * token that travels down it when a handoff starts — the same motion the
     * product performs.
     */
    let runner = null;
    function targetsSection() {
      const others = SLIPSTREAM_PLATFORM_LIST.filter((p) => p.id !== platform.id);
      const ready = !!(state.capture?.messages?.length || state.selectedId);

      const lines = h('div', { class: 'lines' }, [h('div', { class: 'trunk' })]);
      runner = h('span', { class: 'runner' });
      lines.appendChild(runner);

      for (const target of others) {
        const busy = state.busyTarget === target.id;
        const btn = h('button', {
          class: 'target' + (busy ? ' busy' : ''),
          disabled: !ready || !!state.busyTarget,
          onclick: () => handleHandoff(target, btn)
        });
        btn.style.setProperty('--ss-tint', target.color);
        btn.appendChild(h('span', { class: 'stn', html: slipstreamLogo(target.id, { size: 16 }) }));
        btn.appendChild(h('span', { class: 'tname', text: target.name }));
        if (busy) btn.appendChild(h('span', { class: 'eta', text: 'carrying…' }));
        else btn.appendChild(h('span', { class: 'go', html: ICONS.go }));
        lines.appendChild(btn);
      }

      return h('section', {}, [
        h('div', { class: 'label' }, [
          h('span', { text: 'Change lines' }),
          ready ? null : h('span', { class: 'count', text: 'capture a thread first' })
        ]),
        lines
      ]);
    }

    async function handleHandoff(target, btn) {
      // Send the token down the trunk to the station being boarded.
      if (runner && btn) {
        runner.style.transform = `translateY(${btn.offsetTop + btn.offsetHeight / 2 - 11}px)`;
        runner.classList.add('go');
      }
      state.busyTarget = target.id;
      render();
      try {
        await onHandoff?.({ target });
        notify(`Carried to ${target.name}`);
      } catch (err) {
        notify(err?.message || `Could not carry this to ${target.name}`, true);
      } finally {
        state.busyTarget = null;
        render();
      }
    }

    /**
     * Built once and never re-rendered: a rebuild mid-sentence would drop the
     * user's focus and cursor while auto-capture ticks in the background.
     */
    let enhancerNode = null;
    let enhancerUndo = null;

    function enhancerSection() {
      if (enhancerNode) return enhancerNode;

      const input = h('textarea', {
        placeholder: 'Rough prompt goes here — or pull what you have already typed.',
        spellcheck: 'false',
        'aria-label': 'Prompt to enhance'
      });
      if (state.enhancerDraft) input.value = state.enhancerDraft;
      input.addEventListener('input', () => {
        state.enhancerDraft = input.value;
      });

      const runBtn = h('button', {
        class: 'btn primary',
        html: ICONS.spark + '<span>Enhance</span>',
        onclick: async () => {
          const raw = input.value.trim();
          if (!raw) {
            notify('Nothing to enhance yet', true);
            return;
          }
          state.enhancing = true;
          runBtn.disabled = true;
          runBtn.innerHTML = ICONS.spark + '<span>Enhancing…</span>';
          try {
            const improved = await onEnhance?.({ raw });
            state.enhancerDraft = improved;
            input.value = improved;
            state.lastComposerValue = raw;
            syncEnhancer();
            notify('Rewritten and sent to the composer');
          } catch (err) {
            notify(err?.message || 'Enhancer failed', true);
          } finally {
            state.enhancing = false;
            runBtn.disabled = false;
            runBtn.innerHTML = ICONS.spark + '<span>Enhance</span>';
          }
        }
      });

      const pullBtn = h('button', {
        class: 'btn',
        text: 'Pull from composer',
        onclick: () => {
          const current = options.readComposer?.() || '';
          if (!current.trim()) {
            notify('The composer is empty', true);
            return;
          }
          input.value = current;
          state.enhancerDraft = current;
        }
      });

      const undoBtn = h('button', {
        class: 'btn icon-only',
        title: 'Put my original prompt back',
        'aria-label': 'Put my original prompt back',
        html: ICONS.undo,
        onclick: () => {
          if (state.lastComposerValue == null) return;
          options.writeComposer?.(state.lastComposerValue);
          input.value = state.lastComposerValue;
          state.enhancerDraft = state.lastComposerValue;
          state.lastComposerValue = null;
          notify('Your original prompt is back');
          syncEnhancer();
        }
      });

      undoBtn.hidden = true;
      enhancerUndo = undoBtn;

      enhancerNode = h('section', {}, [
        h('div', { class: 'label' }, [h('span', { text: 'Prompt enhancer' })]),
        input,
        h('div', { class: 'row', style: 'margin-top:9px' }, [undoBtn, pullBtn, runBtn]),
        h('div', {
          class: 'hint',
          html: 'Rewritten by GPT-OSS 120B on Groq. <kbd>⌘⇧K</kbd> hides this panel.'
        })
      ]);
      return enhancerNode;
    }

    /** The only part of the enhancer that changes after it is built. */
    function syncEnhancer() {
      if (enhancerUndo) enhancerUndo.hidden = state.lastComposerValue == null;
    }

    function historySection() {
      if (!state.contexts.length) return null;
      const list = h('div', { class: 'history' });
      for (const ctx of state.contexts.slice(0, 6)) {
        const item = h('button', {
          class: 'hitem' + (ctx.id === state.selectedId ? ' active' : ''),
          onclick: () => {
            state.selectedId = ctx.id;
            onSelectContext?.(ctx.id);
            render();
          }
        });
        const source = SLIPSTREAM_PLATFORM_LIST.find((p) => p.id === ctx.platform);
        if (source) item.style.setProperty('--ss-tint', source.color);
        item.appendChild(
          h('span', { class: 'logo', html: slipstreamLogo(ctx.platform, { size: 14 }) })
        );
        item.appendChild(h('span', { class: 't', text: ctx.title || 'Untitled thread' }));
        item.appendChild(h('span', { class: 'n', text: timeAgo(ctx.capturedAt) }));
        list.appendChild(item);
      }
      return h('section', {}, [
        h('div', { class: 'label' }, [
          h('span', { text: 'Saved threads' }),
          h('span', { class: 'count', text: String(state.contexts.length) })
        ]),
        list
      ]);
    }

    // Persistent slots: only the parts whose data changed are replaced, so the
    // enhancer keeps its focus, selection and scroll position across updates.
    const threadSlot = h('div', { class: 'slot' });
    const targetsSlot = h('div', { class: 'slot' });
    const enhancerSlot = h('div', { class: 'slot' });
    const historySlot = h('div', { class: 'slot' });
    body.append(banner, threadSlot, targetsSlot, enhancerSlot, historySlot);

    function render() {
      renderBanner();
      threadSlot.replaceChildren(threadSection());
      targetsSlot.replaceChildren(targetsSection());
      if (!enhancerSlot.firstChild) enhancerSlot.appendChild(enhancerSection());
      syncEnhancer();
      const history = historySection();
      historySlot.replaceChildren(...(history ? [history] : []));
      pip.classList.toggle('on', !!state.limit);
    }

    /* -------------------------------------------------------------- api */
    const api = {
      show() {
        state.open = true;
        panel.classList.add('open');
        render();
      },
      hide() {
        state.open = false;
        panel.classList.remove('open');
      },
      toggle() {
        state.open ? api.hide() : api.show();
      },
      isOpen: () => state.open,
      setCapture(capture) {
        state.capture = capture;
        if (state.open) render();
      },
      setContexts(contexts) {
        state.contexts = contexts || [];
        if (!state.selectedId && state.contexts[0]) state.selectedId = state.contexts[0].id;
        if (state.open) render();
      },
      setSelected(id) {
        state.selectedId = id;
        if (state.open) render();
      },
      showLimit(info) {
        state.limit = info;
        pip.classList.add('on');
        if (!state.open) api.show();
        else render();
      },
      clearLimit() {
        state.limit = null;
        pip.classList.remove('on');
        if (state.open) render();
      },
      notify,
      selectedId: () => state.selectedId,
      destroy() {
        host.remove();
      },
      setVisible(visible) {
        host.style.display = visible ? '' : 'none';
      }
    };

    render();
    return api;
  }

  root.SlipstreamWidget = { create };
})(window);
