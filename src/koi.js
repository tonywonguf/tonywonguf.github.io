// Lazy start of the koi pond. The build puts this file in dist/app.js.
// The renderer (koi/koi-grain.js, koi/koi-motion.js) and the swim sheet are approximately 150 KB.
// Thus they are not in the first load. The page gets them only when the pond section comes near
// the screen. Until then, the canvas shows only its background color.
// If the reader asks for reduced motion, koi-grain shows the still koi.
(() => {
  const canvas = document.getElementById("koi");
  if (!canvas || !("IntersectionObserver" in window)) return;
  const pond = canvas.closest(".pond");
  const start = async () => {
    try {
      // The URL is relative to the page, as app.js is a classic script.
      const { mountKoi } = await import(
        new URL("koi/koi-grain.js", document.baseURI).href
      );
      await mountKoi(canvas, {
        base: "koi",
        body: "white",
        effect: "bayer",
        cell: 3,
        grain: 0.04,
      });
      pond.classList.add("on");
    } catch {
      // Without the koi, the section keeps its text and the empty pond.
      pond.classList.add("off");
    }
  };
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        start();
      }
    },
    { rootMargin: "300px 0px" },
  );
  io.observe(canvas);
})();
