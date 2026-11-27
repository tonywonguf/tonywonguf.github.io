// koi-grain renderer: draws a baked git-koi swim loop in a pond, with grain and
// dither effects, in one WebGL2 fragment shader pass.
//
// The effects follow public image-processing math (ordered dither, halftone, ASCII
// ramps, film grain). The look is inspired by grainrad.com. No grainrad code is used.
// The koi frames come from git-koi (MIT, Anthony Yalong), baked by `koi-grain bake`
// as a grid of tail beats, strokes and body bends. koi-motion.js moves the koi on a
// smooth random path, and the shader turns the frame to the koi's heading.

import { createKoi, hashSeed } from "./koi-motion.js";

export const EFFECTS = ["pixel", "bayer", "duotone", "halftone", "ascii"];

const GLYPHS = " .:-=+*#%@";

const VERTEX = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uSheet;
uniform sampler2D uGlyphs;
uniform vec4 uRect;      // sheet x, y, width, height of the current frame
uniform vec2 uRectPond;  // the frame's left top corner, relative to the head
uniform vec4 uKoi;       // head x, y in the pond, cos and sin of the heading
uniform float uDepth;    // 0 at the surface, 1 deep
uniform vec2 uRes;       // canvas size in device pixels
uniform float uScale;    // device pixels per pond pixel
uniform vec2 uOrigin;    // device pixel of the pond's left top corner
uniform float uTime;
uniform int uEffect;
uniform float uCell;     // effect cell size in device pixels
uniform float uGrain;
uniform vec4 uRipples[8]; // pond x, pond y, start time, strength
uniform vec3 uInk;
uniform vec3 uPaper;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

// Device pixel (top-left origin) to pond pixel.
vec2 toPond(vec2 device) { return (device - uOrigin) / uScale; }

// The koi frame at a pond pixel: into the koi's own frame (head at the origin,
// facing +x), smaller when deeper, then the nearest texel of the crop.
vec4 koiAt(vec2 p) {
  vec2 d = p - uKoi.xy;
  vec2 local = vec2(d.x * uKoi.z + d.y * uKoi.w, -d.x * uKoi.w + d.y * uKoi.z);
  local /= 1.0 - 0.14 * uDepth;
  vec2 q = floor(local - uRectPond);
  if (q.x < 0.0 || q.y < 0.0 || q.x >= uRect.z || q.y >= uRect.w) return vec4(0.0);
  return texelFetch(uSheet, ivec2(uRect.xy + q), 0);
}

// Radial push and bright ring from click ripples.
vec3 ripple(vec2 p) {
  vec2 push = vec2(0.0);
  float ring = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 3.0) continue;
    vec2 d = p - r.xy;
    float dist = length(d) + 1e-3;
    float front = age * 70.0;
    float band = exp(-pow((dist - front) / 14.0, 2.0)) * exp(-age * 1.3) * r.w;
    float wave = sin(dist * 0.35 - age * 9.0);
    push += d / dist * wave * band * 3.0;
    ring += max(wave, 0.0) * band;
  }
  return vec3(push, ring);
}

vec3 water(vec2 p) {
  float t = uTime;
  float n = noise(p * 0.018 + vec2(t * 0.05, t * 0.03)) * 0.65
          + noise(p * 0.045 - vec2(t * 0.04, -t * 0.06)) * 0.35;
  float caustic = pow(1.0 - abs(sin(n * 9.0 + t * 0.4)), 8.0);
  vec3 deep = vec3(0.035, 0.095, 0.120);
  vec3 shallow = vec3(0.075, 0.190, 0.215);
  return mix(deep, shallow, n) + caustic * vec3(0.09, 0.15, 0.14);
}

// The pond scene at a pond pixel: water, the koi's shadow, the koi, ripples.
vec3 scene(vec2 p) {
  vec3 r = ripple(p);
  vec2 q = p + r.xy + vec2(sin(p.y * 0.08 + uTime * 1.7), cos(p.x * 0.07 + uTime * 1.3)) * 0.35;
  vec3 color = water(q);
  // A koi near the surface throws a faint shadow far away; a deep koi is close
  // to the bottom, so its shadow is near and dark, and the water tints it.
  float shadow = koiAt(q - mix(vec2(9.0, 12.0), vec2(3.0, 4.0), uDepth)).a;
  color *= 1.0 - mix(0.3, 0.55, uDepth) * shadow;
  vec4 koi = koiAt(q);
  vec3 tinted = mix(koi.rgb, color * 1.4, 0.5 * uDepth);
  color = mix(color, tinted, koi.a);
  return color + r.z * 0.18;
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Ordered 8x8 Bayer threshold in 0..1, from bit interleaving of x and x^y.
float bayer8(ivec2 v) {
  int x = v.x & 7;
  int xy = x ^ (v.y & 7);
  int m = ((xy & 1) << 5) | ((x & 1) << 4) | ((xy & 2) << 2) | ((x & 2) << 1) | ((xy & 4) >> 1) | ((x & 4) >> 2);
  return (float(m) + 0.5) / 64.0;
}

// Interleaved gradient noise: a cheap blue-noise-like threshold with no texture.
float ign(vec2 v) { return fract(52.9829189 * fract(dot(v, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec2 device = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 color;
  if (uEffect == 1 || uEffect == 2) {
    vec2 cell = floor(device / uCell);
    vec3 c = scene(toPond((cell + 0.5) * uCell));
    if (uEffect == 1) {
      float t = bayer8(ivec2(cell));
      float levels = 4.0;
      color = floor(c * 1.08 * (levels - 1.0) + t) / (levels - 1.0);
    } else {
      float t = ign(cell);
      float l = clamp(luma(c) * 1.6, 0.0, 1.0);
      float tone = floor(l * 3.0 + t) / 3.0;
      color = mix(uInk, uPaper, tone);
    }
  } else if (uEffect == 3) {
    const float angle = 0.785398;
    mat2 rot = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
    vec2 u = rot * device;
    float pitch = uCell * 2.0;
    vec2 center = (floor(u / pitch) + 0.5) * pitch;
    vec3 c = scene(toPond(transpose(rot) * center));
    float l = clamp(luma(c) * 1.8, 0.0, 1.0);
    float radius = pitch * 0.5 * sqrt(l) * 1.35;
    float ink = smoothstep(radius + 0.8, radius - 0.8, length(u - center));
    color = mix(uInk * 0.6, c * 1.25, ink);
  } else if (uEffect == 4) {
    vec2 size = vec2(uCell, uCell * 1.6) * 2.5;
    vec2 cell = floor(device / size);
    vec3 c = scene(toPond((cell + 0.5) * size));
    float l = clamp(luma(c) * 2.6 + 0.06, 0.0, 0.999);
    float index = floor(l * float(${GLYPHS.length}));
    vec2 inCell = fract(device / size);
    float mask = texture(uGlyphs, vec2((index + inCell.x) / float(${GLYPHS.length}), inCell.y)).a;
    color = mix(uInk * 0.5, c * 1.6 + 0.08, mask);
  } else {
    color = scene(toPond(device));
  }
  // Film grain in cells of about two device pixels, new each grain tick.
  float grain = hash(floor(device / 2.0) + floor(uTime * 15.0) * vec2(17.0, 59.0)) - 0.5;
  color += grain * uGrain;
  vec2 uv = gl_FragCoord.xy / uRes;
  color *= 1.0 - 0.35 * smoothstep(0.35, 0.95, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)) * 0.9);
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "shader compile failed");
  }
  return shader;
}

function texture(gl, source, filter) {
  const handle = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return handle;
}

function glyphAtlas() {
  const width = 24;
  const height = 38;
  const canvas = document.createElement("canvas");
  canvas.width = width * GLYPHS.length;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.font = `700 ${height - 6}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  [...GLYPHS].forEach((glyph, index) =>
    context.fillText(glyph, index * width + width / 2, height / 2 + 1),
  );
  return canvas;
}

async function loadImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  // Some static servers send WebP as application/octet-stream, and WebKit then
  // refuses to decode it. The type from the file name is always correct here.
  const type = url.endsWith(".webp") ? "image/webp" : "image/png";
  const blob = new Blob([await response.arrayBuffer()], { type });
  return createImageBitmap(blob, {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
}

function hexColor(hex) {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/**
 * Draw the koi into `canvas`. Options:
 *   base: folder with koi.json and the sheets (default "koi")
 *   body: a baked body name (default: white, the default body of git-koi)
 *   effect: one of EFFECTS (default "bayer")
 *   cell: effect cell size in CSS pixels (default 4)
 *   grain: grain strength 0..0.3 (default 0.07)
 *   ink, paper: hex colors for the two-tone effects
 *   still: true forces the still pose (default: prefers-reduced-motion)
 *   seed: the koi's personality seed (default: from the account facts and the day)
 *   pathSeed: the seed of the path (default: new on each visit)
 *   pondLengths: the short side of the pond in koi body lengths (default 3.4)
 *   onInfo: called with the koi facts from koi.json
 * Returns a controller: set({effect, body, cell, grain}), feed(x, y), destroy().
 */
export async function mountKoi(canvas, options = {}) {
  const state = {
    base: options.base ?? "koi",
    effect: options.effect ?? "bayer",
    cell: options.cell ?? 4,
    grain: options.grain ?? 0.07,
    ink: hexColor(options.ink ?? "#0a1a20"),
    paper: hexColor(options.paper ?? "#f2e6cf"),
    still:
      options.still ?? matchMedia("(prefers-reduced-motion: reduce)").matches,
    pondLengths: options.pondLengths ?? 3.4,
  };
  const manifest = await (await fetch(`${state.base}/koi.json`)).json();
  options.onInfo?.(manifest.info);
  state.body =
    options.body && manifest.bodies[options.body]
      ? options.body
      : manifest.bodies.white
        ? "white"
        : Object.keys(manifest.bodies)[0];

  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return mountFallback(canvas, state, manifest);

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "a");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniform = {};
  for (const name of [
    "uSheet",
    "uGlyphs",
    "uRect",
    "uRectPond",
    "uKoi",
    "uDepth",
    "uRes",
    "uScale",
    "uOrigin",
    "uTime",
    "uEffect",
    "uCell",
    "uGrain",
    "uRipples",
    "uInk",
    "uPaper",
  ]) {
    uniform[name] = gl.getUniformLocation(program, name);
  }
  gl.activeTexture(gl.TEXTURE1);
  texture(gl, glyphAtlas(), gl.LINEAR);
  gl.uniform1i(uniform.uGlyphs, 1);
  gl.uniform1i(uniform.uSheet, 0);

  let sheet = null;
  let sheetTexture = null;
  async function loadBody() {
    const entry = manifest.bodies[state.body].swim;
    const [meta, image] = await Promise.all([
      fetch(`${state.base}/${entry.meta}`).then((response) => response.json()),
      loadImage(`${state.base}/${entry.src}`),
    ]);
    sheet = { ...meta, ...entry };
    gl.activeTexture(gl.TEXTURE0);
    if (sheetTexture) gl.deleteTexture(sheetTexture);
    sheetTexture = texture(gl, image, gl.NEAREST);
    image.close?.();
  }
  await loadBody();
  const length = bodyLength(sheet);

  // The pond fills the canvas. Its short side is `pondLengths` body lengths.
  function layout() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const scale = Math.min(width, height) / (state.pondLengths * length);
    return { ratio, width, height, scale, pond: [width / scale, height / scale] };
  }

  const info = manifest.info ?? {};
  const firstView = layout();
  const koi = createKoi({
    width: firstView.pond[0],
    height: firstView.pond[1],
    length,
    behavior: info.behavior,
    seed: options.seed ?? hashSeed(info.observed_on, info.total_contributions),
    pathSeed:
      options.pathSeed ?? crypto.getRandomValues(new Uint32Array(1))[0],
  });

  let time = 0;
  const ripples = new Float32Array(32);
  let rippleNext = 0;
  function addRipple(x, y, strength) {
    ripples.set([x, y, time, strength], rippleNext * 4);
    rippleNext = (rippleNext + 1) % 8;
  }

  let last = performance.now();
  function advance(now) {
    const seconds = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (state.still) return;
    time += seconds;
    koi.step(seconds);
    for (const event of koi.drain()) {
      const s = koi.state;
      if (event.type === "eat") addRipple(event.x, event.y, 0.9);
      // A stroke near the surface leaves a small swirl behind the tail.
      else if (s.depth < 0.45)
        addRipple(
          s.x - Math.cos(s.heading) * length * 0.85,
          s.y - Math.sin(s.heading) * length * 0.85,
          0.3 * event.strength * (1 - s.depth),
        );
    }
  }

  function draw() {
    const view = layout();
    koi.resize(view.pond[0], view.pond[1]);
    const s = koi.state;
    let x = s.x;
    let y = s.y;
    let heading = s.heading;
    let frame;
    if (state.still) {
      // The still pose: centered, as git-koi draws it, with a slight heading.
      heading = -0.12;
      x = view.pond[0] / 2 + length * 0.45;
      y = view.pond[1] / 2;
      frame = frameIndex(sheet.grid, 0, 0, 0);
    } else {
      frame = frameIndex(sheet.grid, s.phase, s.stroke, s.bend);
    }
    const r = sheet.rects.slice(frame * 6, frame * 6 + 6);
    gl.viewport(0, 0, view.width, view.height);
    gl.uniform4f(uniform.uRect, r[0], r[1], r[2], r[3]);
    gl.uniform2f(uniform.uRectPond, r[4] - sheet.head[0], r[5] - sheet.head[1]);
    gl.uniform4f(uniform.uKoi, x, y, Math.cos(heading), Math.sin(heading));
    gl.uniform1f(uniform.uDepth, state.still ? 0.3 : s.depth);
    gl.uniform2f(uniform.uRes, view.width, view.height);
    gl.uniform1f(uniform.uScale, view.scale);
    gl.uniform2f(uniform.uOrigin, 0, 0);
    gl.uniform1f(uniform.uTime, time);
    gl.uniform1i(uniform.uEffect, Math.max(0, EFFECTS.indexOf(state.effect)));
    gl.uniform1f(uniform.uCell, Math.max(1, state.cell * view.ratio));
    gl.uniform1f(uniform.uGrain, state.grain);
    gl.uniform4fv(uniform.uRipples, ripples);
    gl.uniform3fv(uniform.uInk, state.ink);
    gl.uniform3fv(uniform.uPaper, state.paper);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Draw at most 30 times per second, only while the canvas is on screen.
  let visible = true;
  let handle = 0;
  let lastDraw = 0;
  function tick(now) {
    handle = 0;
    if (!visible || document.hidden || state.still) return;
    if (now - lastDraw >= 1000 / 30 - 1) {
      lastDraw = now;
      advance(now);
      draw();
    }
    handle = requestAnimationFrame(tick);
  }
  function wake() {
    // The koi does not swim while nobody sees it, so the time gap is cut.
    last = performance.now();
    if (state.still) draw();
    else if (!handle) handle = requestAnimationFrame(tick);
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
  });
  observer.observe(canvas);
  const resize = new ResizeObserver(() => wake());
  resize.observe(canvas);
  document.addEventListener("visibilitychange", wake);

  function feed(x, y) {
    if (state.still) return;
    addRipple(x, y, 1);
    koi.feed(x, y);
  }
  function onPointer(event) {
    const view = layout();
    const rect = canvas.getBoundingClientRect();
    feed(
      ((event.clientX - rect.left) * view.ratio) / view.scale,
      ((event.clientY - rect.top) * view.ratio) / view.scale,
    );
  }
  canvas.addEventListener("pointerdown", onPointer);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    state.still = true;
  });

  wake();
  return {
    gl,
    manifest,
    draw,
    koi,
    feed,
    get body() {
      return state.body;
    },
    async set(changes) {
      const bodyChanged =
        changes.body &&
        changes.body !== state.body &&
        manifest.bodies[changes.body];
      Object.assign(state, changes);
      if (bodyChanged) await loadBody();
      wake();
    },
    destroy() {
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", wake);
      canvas.removeEventListener("pointerdown", onPointer);
      if (handle) cancelAnimationFrame(handle);
    },
  };
}

/**
 * The grid frame for a tail-beat phase (radians), a stroke (0..1) and a body bend
 * (radians): the nearest baked stroke and bend, and the phase step it is in.
 */
export function frameIndex(grid, phase, stroke, bend) {
  const nearest = (values, value) =>
    values.reduce(
      (best, candidate, index) =>
        Math.abs(candidate - value) < Math.abs(values[best] - value)
          ? index
          : best,
      0,
    );
  const turn = (((phase / (2 * Math.PI)) % 1) + 1) % 1;
  const phaseIndex = Math.floor(turn * grid.phases) % grid.phases;
  const strokeIndex = nearest(grid.strokes, stroke);
  const bendIndex = nearest(grid.bends, bend);
  return (bendIndex * grid.strokes.length + strokeIndex) * grid.phases + phaseIndex;
}

/** The body length in pond pixels: the width of the straight glide frame. */
export function bodyLength(sheet) {
  const straight = frameIndex(sheet.grid, 0, 0, 0);
  return sheet.rects[straight * 6 + 2];
}

// Without WebGL2: the still koi, crisp, on flat water, with no effects.
async function mountFallback(canvas, state, manifest) {
  const context = canvas.getContext("2d");
  const entry = manifest.bodies[state.body].swim;
  const [sheet, image] = await Promise.all([
    fetch(`${state.base}/${entry.meta}`).then((response) => response.json()),
    loadImage(`${state.base}/${entry.src}`),
  ]);
  const frame = frameIndex(sheet.grid, 0, 0, 0);
  const [sx, sy, w, h] = sheet.rects.slice(frame * 6, frame * 6 + 4);
  function draw() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
    const scale = Math.min(canvas.width, canvas.height) / (3.4 * w);
    context.fillStyle = "#0f2a31";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      sx,
      sy,
      w,
      h,
      (canvas.width - w * scale) / 2,
      (canvas.height - h * scale) / 2,
      w * scale,
      h * scale,
    );
  }
  draw();
  return {
    gl: null,
    manifest,
    draw,
    async set() {
      draw();
    },
    feed() {},
    destroy() {},
  };
}
