// Runtime of the project carousel. The build puts this file inline at the end of the page.
// The track is a normal scroll container, so the carousel also works without this script.
// This script adds the arrow buttons, the arrow keys, the counter and the progress bar.
(() => {
  const track = document.getElementById("track");
  if (!track) return;
  const slides = track.children;
  const pos = document.getElementById("pos");
  const bar = document.getElementById("bar");
  const total = slides.length;
  let index = 0;
  let queued = false;
  // While a button or a key moves the track, the counter shows the target, not the slides that go past.
  // The lock stops at the scrollend event, or after 1.5 s in a browser that does not send scrollend.
  let lockUntil = 0;

  // The slides snap to their start edge, after the padding of the track.
  const pad = () => parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
  const current = () => {
    if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 2) return total - 1;
    const at = track.scrollLeft + pad();
    let best = 0;
    for (let i = 1; i < total; i++)
      if (Math.abs(slides[i].offsetLeft - at) < Math.abs(slides[best].offsetLeft - at)) best = i;
    return best;
  };
  const show = () => {
    queued = false;
    if (performance.now() < lockUntil) return;
    mark(current());
  };
  const mark = (i) => {
    if (i === index) return;
    index = i;
    pos.textContent = String(i + 1).padStart(2, "0");
    bar.style.width = ((i + 1) / total) * 100 + "%";
    for (let k = 0; k < total; k++) slides[k].classList.toggle("on", k === i);
  };
  const go = (i) => {
    i = (i + total) % total;
    mark(i);
    lockUntil = performance.now() + 1500;
    track.scrollTo({ left: slides[i].offsetLeft - pad() });
  };

  slides[0].classList.add("on");
  track.parentNode.classList.add("js");
  track.addEventListener("scrollend", () => {
    lockUntil = 0;
    mark(current());
  });
  track.addEventListener(
    "scroll",
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(show);
      }
    },
    { passive: true },
  );
  document.getElementById("prev").onclick = () => go(index - 1);
  document.getElementById("next").onclick = () => go(index + 1);
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      go(index + (e.key === "ArrowRight" ? 1 : -1));
    }
  });
})();
