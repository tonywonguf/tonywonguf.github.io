// Runtime of the project carousel. The build puts this file inline at the end of the page.
// Without this script, the track is a normal scroll container with snap points.
// With this script, the track does not scroll. Each slide moves with a transform, and the
// position wraps around, so the carousel has no start and no end.
// Input: mouse drag with momentum, touch swipe, horizontal trackpad scroll, arrow keys, buttons.
// With prefers-reduced-motion, the drag follows the pointer, but the slides do not glide.
(() => {
  const track = document.getElementById("track");
  if (!track) return;
  const root = track.parentNode;
  const slides = [...track.children];
  const total = slides.length;
  const pos = document.getElementById("pos");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const TAU = 450; // ms, time constant of the glide after a flick (the decay of the speed)
  const STEP_TAU = 110; // ms, time constant for a move by a button or a key

  let step = 1; // px from the start of one slide to the start of the next
  let x = 0; // px, the current position of the track
  let target = 0; // px, where the glide stops
  let tau = TAU;
  let from = 0; // position at the start of the glide
  let t0 = 0; // time at the start of the glide
  let frame = 0;
  let index = -1;

  const mod = (a, n) => ((a % n) + n) % n;
  const measure = () => {
    step = slides[1]
      ? slides[1].offsetLeft - slides[0].offsetLeft
      : track.clientWidth;
  };

  // Put each slide at its place on the loop. Slide i sits at i*step - x, wrapped into
  // the range from -lead slides to (total - lead) slides, so a slide waits off screen
  // on each side.
  const place = () => {
    const width = total * step;
    const lead = Math.min(2, Math.floor(total / 2)) * step;
    for (let i = 0; i < total; i++) {
      const d = mod(i * step - x + lead, width) - lead;
      const rel = Math.min(1, Math.abs(d) / step);
      slides[i].style.transform =
        `translate3d(${(d - i * step).toFixed(1)}px,0,0) scale(${(1 - 0.06 * rel).toFixed(4)})`;
    }
    const i = mod(Math.round(x / step), total);
    if (i !== index) {
      if (index >= 0) slides[index].classList.remove("on");
      slides[i].classList.add("on");
      index = i;
      pos.textContent = String(i + 1).padStart(2, "0");
    }
  };

  // The glide: x moves to the target on an exponential curve. Its start speed is
  // (target - from) / tau, so a flick keeps its speed and then slows down.
  const tick = (now) => {
    const k = Math.exp(-(now - t0) / tau);
    x = target - (target - from) * k;
    if (Math.abs(target - x) < 0.5) {
      x = target;
      frame = 0;
    } else frame = requestAnimationFrame(tick);
    place();
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const glide = (to, time) => {
    stop();
    // Keep the numbers small: move both values by whole loops.
    const width = total * step;
    const shift = Math.floor(x / width) * width;
    x -= shift;
    target = Math.round((to - shift) / step) * step;
    if (still.matches) {
      x = target;
      place();
      return;
    }
    from = x;
    tau = time;
    t0 = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const go = (n) =>
    glide((frame ? target : Math.round(x / step) * step) + n * step, STEP_TAU);

  // Drag with the mouse, the pen or a finger. The browser keeps vertical page scroll (touch-action: pan-y).
  let drag = null;
  let moved = false;
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    stop();
    moved = false;
    drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      start: x,
      on: false,
      samples: [[e.timeStamp, e.clientX]],
    };
  });
  track.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.on) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(e.clientY - drag.y0) > Math.abs(dx)) {
        drag = null;
        return;
      }
      drag.on = moved = true;
      track.setPointerCapture(e.pointerId);
      root.classList.add("drag");
    }
    x = drag.start - dx;
    drag.samples.push([e.timeStamp, e.clientX]);
    if (drag.samples.length > 6) drag.samples.shift();
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), place()));
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    root.classList.remove("drag");
    if (!d.on) return;
    // Speed in px/ms over the last 100 ms of the drag.
    const now = e.timeStamp;
    const recent = d.samples.filter(([t]) => now - t < 100);
    let v = 0;
    if (recent.length > 1) {
      const [ta, xa] = recent[0];
      const [tb, xb] = recent[recent.length - 1];
      if (tb > ta) v = (xb - xa) / (tb - ta);
    }
    if (still.matches) {
      // No glide: move at most one slide in the direction of a flick.
      const base = Math.round(x / step) * step;
      glide(
        Math.abs(v) > 0.3
          ? Math.round(d.start / step) * step - Math.sign(v) * step
          : base,
        0,
      );
      return;
    }
    // A slow drag over 20 percent of a slide also goes to the next slide.
    const home = Math.round(d.start / step);
    let to = x - v * TAU;
    if (Math.round(to / step) === home && Math.abs(x - d.start) > 0.2 * step)
      to = (home + Math.sign(x - d.start)) * step;
    glide(to, TAU);
  };
  track.addEventListener("pointerup", release);
  track.addEventListener("pointercancel", release);
  // A drag is not a click on a link.
  track.addEventListener(
    "click",
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );
  track.addEventListener("dragstart", (e) => e.preventDefault());

  // Horizontal scroll on a trackpad (or shift and the wheel) moves the track. Vertical scroll stays with the page.
  let wheelTimer = 0;
  track.addEventListener(
    "wheel",
    (e) => {
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (Math.abs(dx) <= Math.abs(e.shiftKey ? 0 : e.deltaY)) return;
      e.preventDefault();
      stop();
      x += dx * (e.deltaMode === 1 ? 16 : 1);
      place();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => glide(x, STEP_TAU * 1.5), 90);
    },
    { passive: false },
  );

  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    }
  });
  document.getElementById("prev").onclick = () => go(-1);
  document.getElementById("next").onclick = () => go(1);
  // When the keyboard focus goes to a link in another slide, that slide comes to the front.
  track.addEventListener("focusin", (e) => {
    const i = slides.findIndex((s) => s.contains(e.target));
    if (i < 0 || i === index) return;
    let n = i - index;
    if (n > total / 2) n -= total;
    if (n < -total / 2) n += total;
    go(n);
  });

  new ResizeObserver(() => {
    const i = Math.round(x / step);
    measure();
    stop();
    x = target = i * step;
    place();
  }).observe(track);

  track.scrollLeft = 0;
  root.classList.add("js");
  measure();
  place();
})();
