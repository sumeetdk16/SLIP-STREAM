/*!
 * starfield.js — a warp-speed starfield drawn on one 2D canvas.
 *
 * Vanilla port of the <Starfield /> React component (same props, same maths),
 * so the pages stay dependency-free. Kept in sync with web/starfield.js.
 *
 * Usage:
 *   <script src="starfield.js"></script>
 *   const field = starfield(document.body, { speed: 1 });
 *   field.destroy();
 *   — or just <script src="starfield.js" data-mount></script>
 *
 * Pass document.body for a fixed canvas behind the whole viewport; any other
 * element gets an absolutely positioned canvas filling its own box.
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    starColor: "rgba(255,255,255,1)",
    bgColor: "rgba(0,0,0,1)",
    mouseAdjust: false,
    easing: 1,
    hyperspace: false,
    warpFactor: 10,
    opacity: 0.1,
    speed: 1,
    quantity: 512
  };

  function starfield(host, options) {
    var o = {};
    for (var k in DEFAULTS) o[k] = options && k in options ? options[k] : DEFAULTS[k];

    var isPage = host === document.body;
    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      (isPage ? "position:fixed;" : "position:absolute;") +
      "inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;";
    if (!isPage && getComputedStyle(host).position === "static") host.style.position = "relative";
    host.insertBefore(canvas, host.firstChild);

    var ctx = canvas.getContext("2d");
    var fill = o.hyperspace ? "rgba(0,0,0," + o.opacity + ")" : o.bgColor;
    var speed = o.hyperspace ? o.speed * o.warpFactor : o.speed;
    var ratio = o.quantity / 2;
    var w = 0, h = 0, cx = 0, cy = 0, z = 0, colorRatio = 0;
    var cursor = { x: 0, y: 0 };
    var stars = [];
    var raf = 0;

    function measure() {
      w = isPage ? window.innerWidth : host.clientWidth;
      h = isPage ? window.innerHeight : host.clientHeight;
      cx = Math.round(w / 2);
      cy = Math.round(h / 2);
      z = (w + h) / 2;
      colorRatio = 1 / z;
      /* Without mouse steering the field drifts toward the cursor's offset
         from centre, so the cursor has to follow the centre on every
         measure. Phones report a ~980px layout width before the viewport
         meta applies; a cursor latched to that first centre sat hundreds of
         px off and dragged every star sideways into long streaks. */
      if (!o.mouseAdjust || !cursor.x || !cursor.y) { cursor.x = cx; cursor.y = cy; }
    }

    function bigBang() {
      stars = [];
      for (var i = 0; i < o.quantity; i++) {
        stars.push([
          Math.random() * w * 2 - cx * 2,
          Math.random() * h * 2 - cy * 2,
          Math.round(Math.random() * z),
          0, 0, 0, 0, true
        ]);
      }
    }

    var touch = global.matchMedia && global.matchMedia("(pointer: coarse)").matches;

    function resize() {
      var ow = canvas.width, oh = canvas.height;
      var nw = isPage ? window.innerWidth : host.clientWidth;
      var nh = isPage ? window.innerHeight : host.clientHeight;
      if (nw === ow && nh === oh) return;
      /* A phone's address bar grows and shrinks the viewport by ~100px on
         every scroll direction change. Resizing the canvas for that clears
         it and rescales every star — a visible jolt. Keep the width-driven
         resize and let CSS stretch the canvas over small height changes. */
      if (touch && isPage && nw === ow && Math.abs(nh - oh) < 160) return;
      measure();
      canvas.width = w;
      canvas.height = h;
      if (!stars.length || !ow || !oh) return bigBang();
      var rw = w / ow, rh = h / oh;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s[0] *= rw;
        s[1] *= rh;
        s[3] = cx + (s[0] / s[2]) * ratio;
        s[4] = cy + (s[1] / s[2]) * ratio;
      }
    }

    function update(dt) {
      if (dt == null) dt = 1;
      var mx = (cursor.x - cx) / o.easing;
      var my = (cursor.y - cy) / o.easing;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s[7] = true;
        s[5] = s[3];
        s[6] = s[4];

        s[0] += (mx >> 4) * dt;
        if (s[0] > cx << 1) { s[0] -= w << 1; s[7] = false; }
        if (s[0] < -cx << 1) { s[0] += w << 1; s[7] = false; }

        s[1] += (my >> 4) * dt;
        if (s[1] > cy << 1) { s[1] -= h << 1; s[7] = false; }
        if (s[1] < -cy << 1) { s[1] += h << 1; s[7] = false; }

        s[2] -= speed * dt;
        if (s[2] > z) { s[2] -= z; s[7] = false; }
        if (s[2] < 0) { s[2] += z; s[7] = false; }

        s[3] = cx + (s[0] / s[2]) * ratio;
        s[4] = cy + (s[1] / s[2]) * ratio;
      }
    }

    function draw() {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = o.starColor;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (s[7] && s[5] > 0 && s[5] < w && s[6] > 0 && s[6] < h) {
          ctx.lineWidth = (1 - colorRatio * s[2]) * 2;
          ctx.beginPath();
          ctx.moveTo(s[5], s[6]);
          ctx.lineTo(s[3], s[4]);
          ctx.stroke();
        }
      }
    }

    var last = 0;
    function frame(now) {
      /* Step in 60fps units, so a 120Hz screen doesn't run the field at
         double speed; capped so a background tab doesn't jump on return. */
      var dt = last && now ? Math.min((now - last) / 16.667, 3) : 1;
      last = now || 0;
      resize();
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }

    function onMouse(e) { cursor.x = e.clientX; cursor.y = e.clientY; }

    measure();
    canvas.width = w;
    canvas.height = h;
    bigBang();

    var still = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      /* Two steps give every star a previous position, so the one frame we
         draw shows short streaks rather than nothing. */
      update(); update(); draw();
      global.addEventListener("resize", onResize);
    } else {
      if (o.mouseAdjust) global.addEventListener("mousemove", onMouse);
      frame();
    }

    function onResize() { resize(); update(); draw(); }

    return {
      canvas: canvas,
      destroy: function () {
        cancelAnimationFrame(raf);
        global.removeEventListener("mousemove", onMouse);
        global.removeEventListener("resize", onResize);
        canvas.remove();
      }
    };
  }

  global.starfield = starfield;

  /* <script src="starfield.js" data-mount> starts one behind the page without
     an inline call, which extension pages' CSP would refuse. */
  var tag = document.currentScript;
  if (tag && tag.hasAttribute("data-mount")) {
    /* Half the stars on phone-sized screens: the same density on a smaller
       canvas, and half the strokes per frame on a weaker GPU. */
    var mount = function () { starfield(document.body, { quantity: global.innerWidth < 700 ? 256 : 512 }); };
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
  }
})(typeof window !== "undefined" ? window : this);
