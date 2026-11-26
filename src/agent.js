// Runtime of the ASCII agent. The build puts this file inline after agentArt.
// It starts only after the page loads and the browser is idle, so it adds no blocking time.
// If the reader asks for reduced motion, the agent stays still.
(() => {
  const el = document.getElementById("agent");
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let col = 1;
  let row = 1;
  let mode = "open";
  let shown = "";
  let px = null;
  let py = null;
  let queued = false;

  const draw = () => {
    queued = false;
    if (px !== null && mode !== "blink") {
      const r = el.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height * 0.55);
      const over = Math.abs(dx) < r.width / 2 && Math.abs(dy) < r.height / 2;
      mode = over ? "happy" : "open";
      const t = Math.max(r.width, 80) / 3;
      col = dx < -t ? 0 : dx > t ? 2 : 1;
      row = dy < -t ? 0 : dy > t ? 2 : 1;
    }
    const key = col + "," + row + "," + mode;
    if (key !== shown) {
      shown = key;
      el.innerHTML = agentArt(col, row, mode);
    }
  };
  const ask = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(draw);
    }
  };
  const look = (e) => {
    px = e.clientX;
    py = e.clientY;
    ask();
  };

  const start = () => {
    addEventListener("pointermove", look, { passive: true });
    addEventListener("pointerdown", look, { passive: true });
    addEventListener("scroll", ask, { passive: true });
    // Blink at random times, a few seconds apart.
    const blink = () => {
      if (!document.hidden && mode !== "happy") {
        mode = "blink";
        draw();
        setTimeout(() => {
          mode = "open";
          ask();
        }, 140);
      }
      setTimeout(blink, 2500 + Math.random() * 4000);
    };
    setTimeout(blink, 2000);
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  if (document.readyState === "complete") idle(start);
  else addEventListener("load", () => idle(start), { once: true });
})();
