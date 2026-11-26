// Runtime of the stage. The build puts this file inline after the art functions (turkey, tree, reindeer, frameHtml) and the carousel script.
// It starts only after the page loads and the browser is idle, so it adds no blocking time.
// If the reader asks for reduced motion, the art stays still.
(() => {
  const start = () => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dark = matchMedia("(prefers-color-scheme: dark)");
  // Ordered dither: a 4 x 4 Bayer matrix. It does not flicker from one frame to the next.
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
    (n) => (n + 0.5) / 16,
  );
  const rgb = (el, name) => {
    const s = getComputedStyle(el).getPropertyValue(name).trim();
    const n = parseInt(s.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  // A loop that runs only while its element is on the screen and the tab is visible.
  const loop = (el, fps, tick) => {
    let seen = false;
    let last = 0;
    let id = 0;
    const run = (t) => {
      id = 0;
      if (!seen || document.hidden) return;
      if (t - last >= 1000 / fps) {
        last = t;
        tick(t / 1000);
      }
      id = requestAnimationFrame(run);
    };
    const wake = () => {
      if (!id && seen && !document.hidden && !still)
        id = requestAnimationFrame(run);
    };
    new IntersectionObserver((e) => {
      seen = e[e.length - 1].isIntersecting;
      wake();
    }).observe(el);
    document.addEventListener("visibilitychange", wake);
  };

  // The stage under the first screen: a turkey in November, a tree with a reindeer in December.
  // ?season=turkey or ?season=tree selects one, for a test.
  const stage = document.getElementById("stage");
  if (stage) {
    const q = new URLSearchParams(location.search).get("season");
    const now = new Date();
    const winter = q
      ? q === "tree"
      : now.getMonth() === 11 || (now.getMonth() === 0 && now.getDate() <= 6);
    const ground = stage.querySelector("canvas");
    const walker = stage.querySelector(".walker");
    stage.dataset.season = winter ? "tree" : "turkey";
    const gc = ground.getContext("2d");
    const flakes = [];
    let col;
    const paint = () => {
      col = rgb(ground, "--ground");
    };
    paint();
    dark.addEventListener("change", paint);
    // The ground: a band of dither at the bottom. In winter, snow falls as single pixels.
    const drawGround = (t) => {
      const w = (ground.width = Math.max(1, Math.round(stage.clientWidth / 4)));
      const h = (ground.height = Math.max(
        1,
        Math.round(stage.clientHeight / 4),
      ));
      const img = gc.createImageData(w, h);
      const d = img.data;
      const set = (x, y, a) => {
        const i = (y * w + x) * 4;
        d[i] = col[0];
        d[i + 1] = col[1];
        d[i + 2] = col[2];
        d[i + 3] = a;
      };
      const top = h * 0.86;
      for (let y = Math.floor(top); y < h; y++)
        for (let x = 0; x < w; x++) {
          const f = (y - top) / (h - top) + 0.12 * Math.sin(x * 0.09 + y * 0.3);
          if (f > bayer[(y & 3) * 4 + (x & 3)]) set(x, y, 255);
        }
      if (winter) {
        while (flakes.length < w / 3)
          flakes.push([
            Math.random() * w,
            Math.random() * h,
            0.3 + Math.random() * 0.7,
          ]);
        for (const p of flakes) {
          p[1] += p[2] * 0.6;
          p[0] += Math.sin(t + p[2] * 9) * 0.2;
          if (p[1] >= h) p[1] = 0;
          const x = Math.floor(p[0] + w) % w;
          set(x, Math.floor(p[1]), 200);
        }
      }
      gc.putImageData(img, 0, 0);
    };
    drawGround(0);
    addEventListener("resize", () => drawGround(0), { passive: true });

    if (winter) {
      walker.remove();
      const t = document.createElement("pre");
      const r = document.createElement("pre");
      t.className = "tree";
      r.className = "deer";
      t.setAttribute("aria-hidden", "true");
      r.setAttribute("aria-hidden", "true");
      stage.append(r, t);
      let a = 0;
      const frame = (s) => {
        t.innerHTML = frameHtml(tree(a, s));
        r.innerHTML = frameHtml(reindeer(Math.floor(s / 0.9) % 2));
      };
      frame(0);
      loop(stage, 12, (s) => {
        a += 0.09;
        frame(s);
        drawGround(s);
      });
    } else {
      const cache = {};
      const html = (pose, dir) =>
        (cache[pose + "," + dir] ||= frameHtml(turkey(pose, dir)));
      const say = stage.querySelector(".say");
      const text = document.querySelector(".hero-text");
      let x = Math.max(0, stage.clientWidth * 0.96 - walker.offsetWidth);
      let dir = 1;
      let mode = "walk";
      let until = 0;
      let pose = 0;
      let lastT = 0;
      let shown = "";
      const put = (p) => {
        const key = p + "," + dir;
        if (key !== shown) {
          shown = key;
          walker.innerHTML = html(p, dir);
        }
        walker.style.transform = "translate3d(" + Math.round(x) + "px,0,0)";
      };
      put(0);
      loop(stage, 8, (s) => {
        const dt = lastT ? Math.min(0.3, s - lastT) : 0;
        lastT = s;
        const max = stage.clientWidth - walker.offsetWidth;
        // Stay to the right of the hero text when the stage is beside it.
        const box = text ? text.getBoundingClientRect() : null;
        const st = stage.getBoundingClientRect();
        let min = box && box.bottom > st.top + 8 ? box.right - st.left + 16 : 0;
        if (min > max) min = 0;
        x = Math.max(min, Math.min(max, x));
        if (s > until) {
          // Choose what to do next: mostly walk, sometimes peck at the ground or gobble.
          const r = Math.random();
          mode = r < 0.6 ? "walk" : r < 0.85 ? "peck" : "gobble";
          until =
            s +
            (mode === "walk"
              ? 3 + Math.random() * 4
              : mode === "peck"
                ? 1.6
                : 1.8);
          if (mode === "walk" && Math.random() < 0.3) dir = -dir;
          say.hidden = mode !== "gobble";
        }
        if (mode === "walk") {
          x += dir * 34 * dt;
          if (x < min || x > max) {
            dir = x < min ? 1 : -1;
            x = Math.max(min, Math.min(max, x));
          }
          pose = (pose + 1) % 4;
          put(pose);
        } else put(mode === "peck" ? (Math.floor(s * 5) % 2 ? 5 : 4) : 0);
        if (!say.hidden) {
          say.style.transform =
            "translate3d(" +
            Math.round(
              dir > 0
                ? x + walker.offsetWidth * 0.62
                : x - say.offsetWidth + walker.offsetWidth * 0.38,
            ) +
            "px,0,0)";
        }
      });
    }
  }
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  if (document.readyState === "complete") idle(start);
  else addEventListener("load", () => idle(start), { once: true });
})();
