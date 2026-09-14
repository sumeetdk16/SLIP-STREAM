/*!
 * glow-cursor.js — a luminous pointer trail rendered in one WebGL pass.
 *
 * Vanilla port of React Bits' <GlowCursor /> (same shader, same props), with
 * ogl's four calls replaced by raw WebGL so the page stays dependency-free.
 *
 * Usage:
 *   <script src="glow-cursor.js"></script>
 *   const glow = glowCursor(document.body, { color: '#ffffff' });
 *   glow.set({ enabled: false }); glow.destroy();
 *
 * Pass document.body to cover the viewport with a fixed canvas; any other
 * element gets an absolutely positioned canvas over its own box.
 */
(function (global) {
  "use strict";

  var MAX_POINTS = 64;

  var VERTEX_SHADER = [
    "attribute vec2 position;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = position * 0.5 + 0.5;",
    "  gl_Position = vec4(position, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FRAGMENT_SHADER = `
precision highp float;
#define MAX_POINTS 64
uniform vec2 uResolution;
uniform vec2 uPoints[MAX_POINTS];
uniform float uPointCount;
uniform vec3 uColor;
uniform vec3 uSecondaryColor;
uniform float uTrailWidth;
uniform float uTaper;
uniform float uGlowIntensity;
uniform float uGlowSpread;
uniform float uHotspot;
uniform float uBrightness;
uniform float uOpacity;
uniform float uPulseSpeed;
uniform float uNoiseStrength;
uniform float uNormalBlend;
uniform float uTime;
uniform float uFade;
varying vec2 vUv;

float sRGB(float x) {
  if (x <= 0.00031308) return 12.92 * x;
  return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float filmGrain(vec2 p, float time) {
  float frame = time * 18.0;
  float frameIndex = mod(floor(frame), 256.0);
  float nextFrameIndex = mod(frameIndex + 1.0, 256.0);
  float blend = fract(frame);
  blend = blend * blend * (3.0 - 2.0 * blend);
  vec2 pixel = floor(p);
  float current = hash(pixel + vec2(frameIndex * 17.0, frameIndex * 31.0));
  float next = hash(pixel + vec2(nextFrameIndex * 17.0, nextFrameIndex * 31.0));
  return mix(current, next, blend) * 2.0 - 1.0;
}
void main() {
  vec2 pixel = vUv * uResolution;
  float denominator = max(uPointCount - 1.0, 1.0);
  float strongest = 0.0;
  float strongestCore = 0.0;
  float colorWeight = 0.0;
  vec3 colorSum = vec3(0.0);
  for (int i = 0; i < MAX_POINTS - 1; i++) {
    float index = float(i);
    // Segments past the trail length contribute nothing; stop there
    // instead of shading all 63 for every pixel.
    if (index >= uPointCount - 1.0) break;
    float active = 1.0;
    vec2 start = uPoints[i];
    vec2 end = uPoints[i + 1];
    vec2 toPixel = pixel - start;
    vec2 segment = end - start;
    float along = clamp(dot(toPixel, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);
    float progress = clamp((index + along) / denominator, 0.0, 1.0);
    float life = pow(max(1.0 - progress, 0.0), mix(0.55, 1.25, uTaper));
    float width = uTrailWidth * mix(1.0, 0.25, pow(progress, mix(0.55, 1.6, uTaper)));
    float distanceToTrail = length(toPixel - segment * along);
    float falloff = max(width * (0.8 + uGlowSpread * 1.4), 0.5);
    float beam = min(1.0, (falloff * falloff) / (distanceToTrail * distanceToTrail + falloff * falloff));
    float core = exp(-pow(distanceToTrail / max(width, 0.5), 2.0) * 2.5);
    float pulseAmount = min(abs(uPulseSpeed), 1.0);
    float pulse = 1.0 + sin(uTime * uPulseSpeed * 3.0 - progress * 11.0) * 0.16 * pulseAmount;
    float intensity = (core + beam * uGlowIntensity * 0.55) * life * pulse * active;
    vec3 segmentColor = mix(uColor, uSecondaryColor, progress);
    strongest = max(strongest, intensity);
    strongestCore = max(strongestCore, core * life * active);
    colorSum += segmentColor * intensity;
    colorWeight += intensity;
  }
  float grain = filmGrain(pixel, uTime);
  float noiseAmount = (1.0 - exp(-uNoiseStrength * 2.2)) * 0.4;
  float alpha = clamp(strongest * uOpacity * uFade, 0.0, 1.0);
  if (alpha < 0.0005) discard;
  vec3 color = colorSum / max(colorWeight, 0.0001);
  color = mix(color, vec3(1.0), smoothstep(0.25, 0.95, strongestCore) * uHotspot);
  float luminance = sRGB(clamp(strongest * uBrightness, 0.0, 1.0));
  luminance *= 1.0 + grain * noiseAmount;
  vec3 additiveColor = color * luminance;
  float normalAlpha = clamp(strongest * uBrightness * uOpacity * uFade, 0.0, 1.0);
  vec3 normalColor = mix(color, vec3(1.0), smoothstep(0.45, 1.0, strongestCore) * uHotspot * 0.35);
  gl_FragColor = vec4(mix(additiveColor, normalColor, uNormalBlend), mix(alpha, normalAlpha, uNormalBlend));
}
`;

  var DEFAULTS = {
    color: "#67E8F9",
    secondaryColor: "#A78BFA",
    trailLength: 40,
    trailWidth: 8,
    trailTaper: 0.8,
    followSpeed: 0.16,
    glowIntensity: 1.9,
    glowSpread: 1.2,
    hotspot: 0.65,
    brightness: 1.25,
    opacity: 1,
    pulseSpeed: 1.1,
    noiseStrength: 0.035,
    idleFade: true,
    idleTimeout: 700,
    fadeDuration: 900,
    blendMode: "screen",
    maxDevicePixelRatio: 1.5,
    enabled: true
  };

  function hexToRgb(hex) {
    var value = (hex || "").replace("#", "").trim();
    if (value.length === 3) value = value.split("").map(function (c) { return c + c; }).join("");
    var parsed = parseInt(value || "000000", 16);
    return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
  }

  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("glow-cursor:", gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function glowCursor(container, options) {
    var config = Object.assign({}, DEFAULTS, options);
    var viewport = container === document.body || container === document.documentElement;

    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      (viewport ? "position:fixed;z-index:9999;" : "position:absolute;z-index:1;") +
      "inset:0;display:block;width:100%;height:100%;pointer-events:none;user-select:none;";
    canvas.style.mixBlendMode = config.blendMode;

    var gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return { set: function () {}, destroy: function () {} };

    var vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return { set: function () {}, destroy: function () {} };
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // One oversized triangle covers clip space — the same trick as ogl's Triangle.
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    var u = {};
    ["uResolution", "uPoints", "uPointCount", "uColor", "uSecondaryColor", "uTrailWidth", "uTaper",
     "uGlowIntensity", "uGlowSpread", "uHotspot", "uBrightness", "uOpacity", "uPulseSpeed",
     "uNoiseStrength", "uNormalBlend", "uTime", "uFade"].forEach(function (name) {
      u[name] = gl.getUniformLocation(program, name);
    });

    if (!viewport && getComputedStyle(container).position === "static") container.style.position = "relative";
    container.appendChild(canvas);

    var pointData = new Float32Array(MAX_POINTS * 2);
    var points = [];
    for (var p = 0; p < MAX_POINTS; p++) points.push({ x: 0, y: 0 });
    var target = { x: 0, y: 0 };
    var head = { x: 0, y: 0 };

    var colors = [hexToRgb(config.color), hexToRgb(config.secondaryColor)];
    var width = 1, height = 1;
    var initialized = false;
    var pointerInside = false;
    var fade = 0;
    var lastInputTime = performance.now();
    var lastFrameTime = performance.now();
    var raf = 0;
    var destroyed = false;
    var idleFrames = 0;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, config.maxDevicePixelRatio);
      width = Math.max(viewport ? window.innerWidth : container.clientWidth, 1);
      height = Math.max(viewport ? window.innerHeight : container.clientHeight, 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function wake() {
      if (!raf && !destroyed) { lastFrameTime = performance.now(); raf = requestAnimationFrame(render); }
    }

    function onMove(event) {
      if (event.pointerType === "touch") return;
      var rect = viewport ? { left: 0, top: 0, width: width, height: height } : container.getBoundingClientRect();
      var x = clamp(event.clientX - rect.left, 0, rect.width);
      var y = clamp(rect.height - (event.clientY - rect.top), 0, rect.height);
      if (!initialized) {
        head.x = target.x = x; head.y = target.y = y;
        points.forEach(function (pt) { pt.x = x; pt.y = y; });
        initialized = true;
        fade = 1;
      }
      target.x = x;
      target.y = y;
      pointerInside = true;
      lastInputTime = performance.now();
      wake();
    }

    function onLeave() {
      pointerInside = false;
      lastInputTime = performance.now();
    }

    function render(now) {
      raf = 0;
      if (destroyed) return;
      var delta = Math.min((now - lastFrameTime) / 16.667, 3);
      lastFrameTime = now;

      if (initialized) {
        var headEase = 1 - Math.pow(1 - clamp(config.followSpeed, 0.01, 0.99), delta);
        var chainEase = 1 - Math.pow(1 - clamp(0.28 + config.followSpeed * 0.35, 0.08, 0.92), delta);
        head.x += (target.x - head.x) * headEase;
        head.y += (target.y - head.y) * headEase;
        points[0].x = head.x;
        points[0].y = head.y;
        for (var i = 1; i < MAX_POINTS; i++) {
          points[i].x += (points[i - 1].x - points[i].x) * chainEase;
          points[i].y += (points[i - 1].y - points[i].y) * chainEase;
        }
        for (var j = 0; j < MAX_POINTS; j++) {
          pointData[j * 2] = points[j].x;
          pointData[j * 2 + 1] = points[j].y;
        }
      }

      var shouldFade = config.idleFade && (!pointerInside || now - lastInputTime > config.idleTimeout);
      var fadeStep = (16.667 * delta) / Math.max(config.fadeDuration, 16);
      var fadeTarget = initialized && config.enabled && !shouldFade ? 1 : 0;
      fade += (fadeTarget - fade) * Math.min(1, fadeStep * 7);

      gl.uniform2f(u.uResolution, width, height);
      gl.uniform2fv(u.uPoints, pointData);
      gl.uniform1f(u.uPointCount, clamp(Math.round(config.trailLength), 2, MAX_POINTS));
      gl.uniform3fv(u.uColor, colors[0]);
      gl.uniform3fv(u.uSecondaryColor, colors[1]);
      gl.uniform1f(u.uTrailWidth, Math.max(config.trailWidth, 0.1));
      gl.uniform1f(u.uTaper, clamp(config.trailTaper, 0, 1));
      gl.uniform1f(u.uGlowIntensity, Math.max(config.glowIntensity, 0));
      gl.uniform1f(u.uGlowSpread, Math.max(config.glowSpread, 0));
      gl.uniform1f(u.uHotspot, clamp(config.hotspot, 0, 1));
      gl.uniform1f(u.uBrightness, Math.max(config.brightness, 0));
      gl.uniform1f(u.uOpacity, clamp(config.opacity, 0, 1));
      gl.uniform1f(u.uPulseSpeed, config.pulseSpeed);
      gl.uniform1f(u.uNoiseStrength, clamp(config.noiseStrength, 0, 1));
      gl.uniform1f(u.uNormalBlend, config.blendMode === "normal" ? 1 : 0);
      gl.uniform1f(u.uTime, now * 0.001);
      gl.uniform1f(u.uFade, fade);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Unlike the React original, stop the loop once fully faded so an idle
      // page costs no GPU; the next pointer move wakes it.
      idleFrames = fade < 0.001 && fadeTarget === 0 ? idleFrames + 1 : 0;
      if (idleFrames < 2) raf = requestAnimationFrame(render);
    }

    var events = viewport ? window : container;
    events.addEventListener("pointermove", onMove, { passive: true });
    if (viewport) {
      document.documentElement.addEventListener("pointerleave", onLeave);
    } else {
      container.addEventListener("pointerenter", onMove);
      container.addEventListener("pointerleave", onLeave);
    }
    var ro = null;
    if (viewport) window.addEventListener("resize", resize);
    else { ro = new ResizeObserver(resize); ro.observe(container); }
    resize();

    return {
      set: function (next) {
        Object.assign(config, next);
        colors = [hexToRgb(config.color), hexToRgb(config.secondaryColor)];
        canvas.style.mixBlendMode = config.blendMode;
        if ("maxDevicePixelRatio" in next) resize();
        wake();
      },
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(raf);
        events.removeEventListener("pointermove", onMove);
        if (viewport) {
          document.documentElement.removeEventListener("pointerleave", onLeave);
          window.removeEventListener("resize", resize);
        } else {
          container.removeEventListener("pointerenter", onMove);
          container.removeEventListener("pointerleave", onLeave);
          ro.disconnect();
        }
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        canvas.remove();
      }
    };
  }

  global.glowCursor = glowCursor;
})(window);
