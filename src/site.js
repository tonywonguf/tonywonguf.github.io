// Runtime of the stage and the dither effects. The build puts this file inline after the art
// functions (turkey, tree, reindeer, frameHtml) and the carousel script.
// It starts only after the page loads and the browser is idle, so it adds no blocking time.
// Without this script, the page shows the server-made ASCII art and CSS gradient covers.
// If the reader asks for reduced motion, the art stays still and a click does nothing.
(() => {
  const start = () => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = matchMedia("(prefers-color-scheme: dark)");
    // Ordered dither: Bayer matrices. The same cell always gets the same threshold, so the
    // pattern does not flicker from one frame to the next.
    const bayer = (n) => {
      let m = [0];
      for (let s = 1; s < n; s *= 2) {
        const next = new Array(s * s * 4);
        for (let y = 0; y < s; y++)
          for (let x = 0; x < s; x++) {
            const v = m[y * s + x] * 4;
            next[y * 2 * s + x] = v;
            next[y * 2 * s + x + s] = v + 2;
            next[(y + s) * 2 * s + x] = v + 3;
            next[(y + s) * 2 * s + x + s] = v + 1;
          }
        m = next;
      }
      return m.map((v) => (v + 0.5) / (n * n));
    };
    const B4 = bayer(4);
    const B8 = bayer(8);
    const hex = (s) => {
      const n = parseInt(s.trim().replace("#", ""), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const cssColor = (el, name) =>
      hex(getComputedStyle(el).getPropertyValue(name));
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
    // All start work goes in small jobs. One idle slot runs jobs for at most 6 ms, so no task
    // is long (Lighthouse counts a task over 50 ms on a phone that is 4 times slower).
    const jobs = [];
    const pump = () => {
      const t = performance.now();
      while (jobs.length && performance.now() - t < 6) jobs.shift()();
      if (jobs.length) idle(pump);
    };
    const later = (f) => {
      jobs.push(f);
      if (jobs.length === 1) idle(pump);
    };
    // Draw a value field v(x, y) in 0..1 with a palette of n colors and ordered dither.
    // The field gives the palette index q = v * (n - 1); the fraction picks the next color
    // when it is above the Bayer threshold of the pixel.
    const dither = (img, w, h, field, pal, y0 = 0, y1 = h, m = B8, size = 8) => {
      const d = img.data;
      const top = pal.length - 1;
      for (let y = y0; y < y1; y++)
        for (let x = 0; x < w; x++) {
          const v = field(x / w, y / h);
          if (v < 0) continue;
          const q = Math.min(top, Math.max(0, v * top));
          let k = Math.floor(q);
          if (q - k > m[(y % size) * size + (x % size)]) k++;
          const c = pal[Math.min(top, k)];
          if (!c) continue;
          const i = (y * w + x) * 4;
          d[i] = c[0];
          d[i + 1] = c[1];
          d[i + 2] = c[2];
          d[i + 3] = c[3] ?? 255;
        }
    };
    // Dither a field into a canvas of w x h pixels, in bands of about 6000 pixels, one job each.
    const paint = (cv, w, h, field, pal, done) => {
      cv.width = w;
      cv.height = h;
      const g = cv.getContext("2d");
      const img = g.createImageData(w, h);
      const band = Math.max(1, Math.floor(6000 / w));
      for (let y = 0; y < h; y += band)
        later(() => dither(img, w, h, field, pal, y, Math.min(h, y + band)));
      later(() => {
        g.putImageData(img, 0, 0);
        done();
      });
    };
    const hsl = (h, s, l) => {
      h = ((h % 360) + 360) % 360;
      s /= 100;
      l /= 100;
      const f = (n) => {
        const k = (n + h / 30) % 12;
        return Math.round(
          255 *
            (l -
              s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
        );
      };
      return [f(0), f(8), f(4)];
    };

    // Project covers: a dithered gradient with contour rings around a point of each project.
    // A canvas at one third of the size, scaled up with sharp pixels. One cover per idle slot.
    const covers = [...document.querySelectorAll(".cover")];
    const drawCover = (el) => {
      const st = el.style;
      const h = parseFloat(st.getPropertyValue("--h"));
      const px = parseFloat(st.getPropertyValue("--x")) / 100;
      const py = parseFloat(st.getPropertyValue("--y")) / 100;
      const a = (parseFloat(st.getPropertyValue("--a")) * Math.PI) / 180;
      // offsetWidth, not the box on the screen: the side slides are scaled.
      if (!el.offsetWidth) return;
      const w = Math.max(1, Math.round(el.offsetWidth / 3));
      const hh = Math.max(1, Math.round(el.offsetHeight / 3));
      const cv =
        el.querySelector("canvas") ||
        el.insertBefore(document.createElement("canvas"), el.firstChild);
      const pal = [
        hsl(h - 40, 55, 14),
        hsl(h - 28, 58, 26),
        hsl(h - 10, 62, 40),
        hsl(h, 68, 54),
        hsl(h + 10, 80, 70),
      ];
      const ca = Math.sin(a);
      const sa = -Math.cos(a);
      const asp = hh / w;
      paint(
        cv,
        w,
        hh,
        (x, y) => {
          // Linear part along the angle of the cover, light at its end.
          const t = (x - 0.5) * ca + (y - 0.5) * sa + 0.5;
          const dx = x - px;
          const dy = (y - py) * asp;
          const d = Math.sqrt(dx * dx + dy * dy);
          const ring = Math.cos(d * 70) * Math.max(0, 1 - d * 1.6);
          return 0.15 + 0.62 * t + 0.16 * ring;
        },
        pal,
        () => el.classList.add("dith"),
      );
    };

    // Hero: a still glow of dithered dots behind the name, in the accent color.
    const hero = document.querySelector(".hero");
    let glow;
    const drawGlow = () => {
      if (!hero) return;
      if (!glow) {
        glow = document.createElement("canvas");
        glow.className = "glow";
        glow.setAttribute("aria-hidden", "true");
        hero.prepend(glow);
      }
      const w = Math.max(1, Math.round(glow.offsetWidth / 3));
      const h = Math.max(1, Math.round(glow.offsetHeight / 3));
      const c = cssColor(document.documentElement, "--accent");
      paint(
        glow,
        w,
        h,
        (x, y) => {
          // An ellipse behind the name that ends inside the canvas, so it has no hard edge.
          const u = (x - 0.3) / 0.27;
          const v = (y - 0.38) / 0.5;
          return Math.max(0, 0.95 * (1 - Math.sqrt(u * u + v * v)));
        },
        [null, [...c, 26], [...c, 60]],
        () => glow.classList.add("on"),
      );
    };

    // The stage under the first screen: a turkey in November, a tree with a reindeer in December.
    // ?season=turkey or ?season=tree selects one, for a test.
    const stage = document.getElementById("stage");
    // The glow and the covers come after the first frame of the stage.
    const rest = () => {
      drawGlow();
      covers.forEach(drawCover);
    };
    if (!stage) return later(rest);
    const q = new URLSearchParams(location.search).get("season");
    const now = new Date();
    const winter = q
      ? q === "tree"
      : now.getMonth() === 11 || (now.getMonth() === 0 && now.getDate() <= 6);
    stage.dataset.season = winter ? "tree" : "turkey";
    const ground = stage.querySelector("canvas");
    const gc = ground.getContext("2d");
    const cv = document.createElement("canvas");
    cv.className = "glyphs";
    // The grain is a canvas, not a background image: a large background image would count as
    // the largest paint (LCP) when it appears after the load.
    const grain = document.createElement("canvas");
    grain.className = "grain";
    stage.append(cv, grain);
    const ctx = cv.getContext("2d");
    const walker = stage.querySelector(".walker");
    const say = stage.querySelector(".say");

    // Each figure is a grid of glyph cells. Each cell has an offset and a speed, so a click
    // can throw the glyphs away and a spring pulls them home.
    const figure = (pre, W, H) => ({
      pre,
      W,
      H,
      x: 0,
      y: 0,
      f: null,
      ox: new Float32Array(W * H),
      oy: new Float32Array(W * H),
      vx: new Float32Array(W * H),
      vy: new Float32Array(W * H),
    });
    const figs = [];
    let turkeyFig;
    let treeFig;
    let deerFig;
    if (winter) {
      walker.remove();
      const mk = (cls, f) => {
        const p = document.createElement("pre");
        p.className = cls;
        p.innerHTML = frameHtml(f);
        stage.append(p);
        return p;
      };
      deerFig = figure(mk("deer", reindeer(0)), 17, 8);
      treeFig = figure(mk("tree", tree(0, 0)), 45, 23);
      figs.push(deerFig, treeFig);
    } else {
      turkeyFig = figure(walker, 46, 22);
      figs.push(turkeyFig);
    }

    // Sizes and colors. They change on resize and on a change of the color scheme.
    let w = 0;
    let h = 0;
    let dpr = 1;
    let cw = 8;
    let lh = 12;
    let font = "";
    let styles = [];
    let base = null;
    let minX = 0;
    const text = document.querySelector(".hero-text");
    let groundCol;
    let shadeCol;
    let snowCol;
    const colors = () => {
      // 11 colors (k0 to k9 and the ink for cells without a color), 3 tones each:
      // shadow, base and light. The tone of a cell comes from ordered dither of a light from the top left.
      styles = [];
      for (let k = 0; k <= 10; k++) {
        const c = cssColor(stage, k < 10 ? "--k" + k : "--ink");
        styles.push(
          css(mix(c, [0, 0, 0], 0.38)),
          css(c),
          css(mix(c, [255, 255, 255], 0.34)),
        );
      }
      groundCol = cssColor(ground, "--ground");
      shadeCol = mix(groundCol, dark.matches ? [0, 0, 0] : [40, 25, 10], 0.45);
      snowCol = dark.matches ? [236, 235, 230] : [255, 255, 255];
      const n = 96;
      const g = document.createElement("canvas");
      g.width = g.height = n;
      const gx = g.getContext("2d");
      const img = gx.createImageData(n, n);
      const v = dark.matches ? 255 : 0;
      for (let i = 0; i < n * n * 4; i += 4) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() < 0.3 ? 6 + Math.random() * 16 : 0;
      }
      gx.putImageData(img, 0, 0);
      tile = g;
    };
    let tile = null;
    // Fill the grain canvas with the noise tile. It is 96 px larger than the stage on each axis,
    // so the loop can move it by up to 96 px.
    const fillGrain = () => {
      grain.width = w + 96;
      grain.height = h + 96;
      const gx = grain.getContext("2d");
      gx.fillStyle = gx.createPattern(tile, "repeat");
      gx.fillRect(0, 0, grain.width, grain.height);
    };
    const place = () => {
      const sr = stage.getBoundingClientRect();
      w = Math.max(1, Math.round(sr.width));
      h = Math.max(1, Math.round(sr.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      fillGrain();
      const cs = getComputedStyle(stage);
      font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.font = font;
      cw = ctx.measureText("M").width;
      lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.08;
      // Where the turkey stays to the right of the hero text, when the stage is beside it.
      const box = text ? text.getBoundingClientRect() : null;
      minX = box && box.bottom > sr.top + 8 ? box.right - sr.left + 16 : 0;
      for (const f of figs) {
        const r = f.pre.getBoundingClientRect();
        f.y = r.top - sr.top;
        if (f !== turkeyFig || !f.f) f.x = r.left - sr.left;
      }
      // The ground: a band of dither at the bottom, at one quarter of the size.
      const gw = (ground.width = Math.max(1, Math.round(w / 4)));
      const gh = (ground.height = Math.max(1, Math.round(h / 4)));
      base = gc.createImageData(gw, gh);
      const d = base.data;
      const top = gh * 0.86;
      for (let y = Math.floor(top); y < gh; y++)
        for (let x = 0; x < gw; x++) {
          const f =
            (y - top) / (gh - top) + 0.12 * Math.sin(x * 0.09 + y * 0.3);
          if (f > B4[(y & 3) * 4 + (x & 3)]) {
            const i = (y * gw + x) * 4;
            d[i] = groundCol[0];
            d[i + 1] = groundCol[1];
            d[i + 2] = groundCol[2];
            d[i + 3] = 255;
          }
        }
    };

    // Ground with a dithered shadow under each figure, and snow in winter.
    const flakes = [];
    const drawGround = () => {
      const gw = ground.width;
      const gh = ground.height;
      const img = gc.createImageData(gw, gh);
      const d = img.data;
      d.set(base.data);
      const set = (x, y, c) => {
        const i = (y * gw + x) * 4;
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      };
      for (const f of figs) {
        const fw = f.W * cw;
        const cx = (f.x + fw * 0.46) / 4;
        const cy = (f.y + f.H * lh - lh * 0.3) / 4;
        const rx = (fw * (f === deerFig ? 0.42 : 0.34)) / 4;
        const ry = Math.max(1.5, lh / 4);
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
          for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
            if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
            const u = (x - cx) / rx;
            const v = (y - cy) / ry;
            const e = 1 - (u * u + v * v);
            if (e > 0 && e * 0.85 > B4[(y & 3) * 4 + (x & 3)])
              set(x, y, shadeCol);
          }
      }
      if (winter) {
        while (flakes.length < gw / 3)
          flakes.push([
            Math.random() * gw,
            Math.random() * gh,
            0.3 + Math.random() * 0.7,
          ]);
        for (const p of flakes) {
          if (!still) {
            p[1] += p[2] * 0.6;
            p[0] += Math.sin(clock + p[2] * 9) * 0.2;
            if (p[1] >= gh) p[1] = 0;
          }
          set(Math.floor(p[0] + gw) % gw, Math.floor(p[1]), snowCol);
        }
      }
      gc.putImageData(img, 0, 0);
    };

    // Draw every glyph of every figure. The glyphs of one style go out together.
    const buckets = [];
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = font;
      ctx.textBaseline = "middle";
      for (let b = 0; b < styles.length; b++) (buckets[b] ||= []).length = 0;
      for (const f of figs) {
        const { W, H, ox, oy } = f;
        for (let r = 0; r < f.f.t.length; r++) {
          const line = f.f.t[r];
          const kl = f.f.k[r];
          for (let c = 0; c < line.length; c++) {
            const ch = line[c];
            if (ch === " ") continue;
            const k = kl[c] === "." ? 10 : kl.charCodeAt(c) - 48;
            const l =
              0.62 - (0.32 * (c - W / 2)) / W - (0.46 * (r - H / 2)) / H;
            const qv = Math.min(1.999, Math.max(0, l * 2));
            let tone = Math.floor(qv);
            if (qv - tone > B4[(r & 3) * 4 + (c & 3)]) tone++;
            const i = r * W + c;
            buckets[k * 3 + tone].push(
              ch,
              f.x + c * cw + ox[i],
              f.y + (r + 0.5) * lh + oy[i],
            );
          }
        }
      }
      for (let b = 0; b < buckets.length; b++) {
        const list = buckets[b];
        if (!list.length) continue;
        ctx.fillStyle = styles[b];
        for (let j = 0; j < list.length; j += 3)
          ctx.fillText(list[j], list[j + 1], list[j + 2]);
      }
    };

    // Physics of the glyphs: a click throws them in one of four ways, the mouse pushes them a little,
    // and after a short hold a spring brings them home.
    let clock = 0;
    let hold = 0;
    let mode = -1;
    let hit = null;
    let energy = 0;
    let pointer = null;
    const throwAt = (px, py) => {
      mode = (mode + 1) % 4;
      hit = [px, py];
      hold = clock + [0.6, 1.1, 0.9, 1.3][mode];
      for (const f of figs)
        for (let i = 0; i < f.W * f.H; i++) {
          const cx = f.x + (i % f.W) * cw + f.ox[i] - px;
          const cy = f.y + Math.floor(i / f.W) * lh + f.oy[i] - py;
          const d = Math.hypot(cx, cy) || 1;
          const rnd = Math.random();
          if (mode === 0) {
            // Burst away from the click.
            const s = 380 + rnd * 620;
            f.vx[i] += (cx / d) * s + (Math.random() - 0.5) * 120;
            f.vy[i] += (cy / d) * s + (Math.random() - 0.5) * 120;
          } else if (mode === 1) {
            // Spin around the click.
            const s = 260 + 380 * rnd;
            f.vx[i] += (-cy / d) * s;
            f.vy[i] += (cx / d) * s;
          } else if (mode === 2) {
            // Float up like steam.
            f.vx[i] += (Math.random() - 0.5) * 120;
            f.vy[i] -= 120 + rnd * 340;
          } else {
            // Fall to the ground and bounce.
            f.vx[i] += (Math.random() - 0.5) * 160;
            f.vy[i] -= rnd * 260;
          }
        }
    };
    const physics = (dt) => {
      energy = 0;
      const free = clock < hold;
      const floor = h * 0.9;
      for (const f of figs) {
        const { W, ox, oy, vx, vy } = f;
        for (let i = 0; i < ox.length; i++) {
          let ax = 0;
          let ay = 0;
          const hx = f.x + (i % W) * cw;
          const hy = f.y + Math.floor(i / W) * lh;
          if (pointer) {
            const dx = hx + ox[i] - pointer[0];
            const dy = hy + oy[i] - pointer[1];
            const d2 = dx * dx + dy * dy;
            if (d2 < 3600 && d2 > 0.01) {
              const d = Math.sqrt(d2);
              const s = (1 - d / 60) * 2600;
              ax += (dx / d) * s;
              ay += (dy / d) * s;
            }
          }
          let damp = 7;
          if (free) {
            damp = 1.4;
            if (mode === 1 && hit) {
              const dx = hx + ox[i] - hit[0];
              const dy = hy + oy[i] - hit[1];
              const d = Math.hypot(dx, dy) || 1;
              ax += (-dy / d) * 500 - (dx / d) * 160;
              ay += (dx / d) * 500 - (dy / d) * 160;
            } else if (mode === 2) ay -= 120;
            else if (mode === 3) ay += 1400;
          } else {
            ax -= 70 * ox[i];
            ay -= 70 * oy[i];
          }
          vx[i] = (vx[i] + ax * dt) * Math.exp(-damp * dt);
          vy[i] = (vy[i] + ay * dt) * Math.exp(-damp * dt);
          ox[i] += vx[i] * dt;
          oy[i] += vy[i] * dt;
          if (free && mode === 3 && hy + oy[i] > floor) {
            oy[i] = floor - hy;
            vy[i] *= -0.42;
          }
          energy +=
            Math.abs(ox[i]) +
            Math.abs(oy[i]) +
            Math.abs(vx[i]) * 0.05 +
            Math.abs(vy[i]) * 0.05;
        }
      }
      // Snap home when the movement is too small to see.
      if (energy < 2 && !free)
        for (const f of figs) {
          f.ox.fill(0);
          f.oy.fill(0);
          f.vx.fill(0);
          f.vy.fill(0);
        }
    };

    // The turkey walks, pecks at the ground and gobbles. 8 steps per second.
    let dir = 1;
    let act = "walk";
    let until = 0;
    let pose = 0;
    const walk = (s, dt) => {
      const fw = turkeyFig.W * cw;
      const max = w - fw;
      const min = minX > max ? 0 : minX;
      let x = Math.max(min, Math.min(max, turkeyFig.x));
      if (s > until) {
        const r = Math.random();
        act = r < 0.6 ? "walk" : r < 0.85 ? "peck" : "gobble";
        until =
          s +
          (act === "walk" ? 3 + Math.random() * 4 : act === "peck" ? 1.6 : 1.8);
        if (act === "walk" && Math.random() < 0.3) dir = -dir;
        say.hidden = act !== "gobble";
      }
      let p = 0;
      if (act === "walk") {
        x += dir * 34 * dt;
        if (x < min || x > max) {
          dir = x < min ? 1 : -1;
          x = Math.max(min, Math.min(max, x));
        }
        pose = (pose + 1) % 4;
        p = pose;
      } else if (act === "peck") p = Math.floor(s * 5) % 2 ? 5 : 4;
      turkeyFig.x = x;
      turkeyFig.f = frames(p, dir);
      if (!say.hidden)
        say.style.transform =
          "translate3d(" +
          // Beside the head, but inside the stage.
          Math.round(
            Math.max(
              0,
              Math.min(
                w - say.offsetWidth,
                dir > 0 ? x + fw * 0.9 : x - say.offsetWidth + fw * 0.1,
              ),
            ),
          ) +
          "px,0,0)";
    };
    const cache = {};
    const frames = (p, d) => (cache[p + "," + d] ||= turkey(p, d));

    let a = 0;
    const season = (s) => {
      a += 0.09;
      treeFig.f = tree(a, s);
      deerFig.f = reindeer(Math.floor(s / 0.9) % 2);
    };

    later(colors);
    later(place);
    later(() => {
      if (winter) {
        treeFig.f = tree(0, 0);
        deerFig.f = reindeer(0);
      } else turkeyFig.f = frames(0, 1);
      drawGround();
    });
    later(() => {
      draw();
      stage.classList.add("live");
    });
    later(rest);
    // Make the turkey frames before the walk needs them, one per job.
    if (!winter)
      for (let p = 0; p < 6; p++) for (const d of [1, -1]) later(() => frames(p, d));
    later(go);
    const redo = () => {
      place();
      drawGround();
      draw();
    };
    addEventListener("resize", redo, { passive: true });
    dark.addEventListener("change", () => {
      colors();
      redo();
      drawGlow();
    });
    addEventListener(
      "resize",
      () => {
        clearTimeout(drawCover.t);
        drawCover.t = setTimeout(() => {
          covers.forEach(drawCover);
          drawGlow();
        }, 200);
      },
      { passive: true },
    );
    function go() {
    if (still) return;

    stage.classList.add("play");
    const local = (e) => {
      const r = stage.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    stage.addEventListener("click", (e) => throwAt(...local(e)));
    stage.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") pointer = local(e);
    });
    stage.addEventListener("pointerleave", () => (pointer = null));

    // One loop: physics at the frame rate, the walk at 8 steps per second, the tree at 12.
    // It runs only while the stage is on the screen and the tab is visible.
    let seen = false;
    let id = 0;
    let last = 0;
    let acc = 0;
    let grainAt = 0;
    const rate = winter ? 1 / 12 : 1 / 8;
    const run = (t) => {
      id = 0;
      if (!seen || document.hidden) return;
      const s = t / 1000;
      const dt = last ? Math.min(0.05, s - last) : 0;
      last = s;
      clock = s;
      acc += dt;
      let dirty = false;
      if (acc >= rate) {
        if (winter) season(s);
        else walk(s, acc);
        acc = 0;
        dirty = true;
        drawGround();
      }
      if (pointer || energy > 0 || clock < hold) {
        physics(dt);
        if (energy > 0) dirty = true;
      }
      if (dirty) draw();
      // Film grain: the noise layer jumps to a new place 12 times per second (only a transform).
      if (s - grainAt > 0.083) {
        grainAt = s;
        grain.style.transform = `translate3d(${Math.floor(Math.random() * 96)}px,${Math.floor(Math.random() * 96)}px,0)`;
      }
      id = requestAnimationFrame(run);
    };
    const wake = () => {
      if (!id && seen && !document.hidden) {
        last = 0;
        id = requestAnimationFrame(run);
      }
    };
    new IntersectionObserver((e) => {
      seen = e[e.length - 1].isIntersecting;
      wake();
    }).observe(stage);
    document.addEventListener("visibilitychange", wake);
    }
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  if (document.readyState === "complete") idle(start);
  else addEventListener("load", () => idle(start), { once: true });
})();
