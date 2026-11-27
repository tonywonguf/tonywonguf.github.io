// Make sure that the project carousel loops, and that each input moves it:
// buttons, arrow keys, mouse drag, a fast flick, touch swipe and horizontal wheel.
// Also make sure that it has no progress bar, and that reduced motion stops the glide.
// Usage: node perf/carouselcheck.mjs URL
import puppeteer from "puppeteer-core";

const url = process.argv[2];
const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--no-sandbox"],
});
let ok = true;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = (pass, name, text) => {
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${text}`);
};

for (const [name, vp] of [
  ["desktop", { width: 1440, height: 900 }],
  ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }],
]) {
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.setViewport(vp);
  await p.goto(url, { waitUntil: "load" });
  const state = () =>
    p.evaluate(() => {
      const s = [...document.querySelectorAll(".slide")];
      const on = s.findIndex((x) => x.classList.contains("on"));
      const left = (i) =>
        s[(i + s.length) % s.length].getBoundingClientRect().left;
      return {
        pos: document.getElementById("pos").textContent,
        on,
        total: s.length,
        // The slide before the active one sits to its left, also at the first slide.
        prevLeft: left(on - 1) < left(on),
        bar: !!document.querySelector(".bar, .dots, #bar"),
      };
    });
  const box = await p.evaluate(() => {
    const r = document
      .querySelector(".slide.on .cover")
      .getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  });
  await p.evaluate((y) => window.scrollBy(0, y - innerHeight / 2), box.y);
  const y = await p.evaluate(() => {
    const r = document
      .querySelector(".slide.on .cover")
      .getBoundingClientRect();
    return r.top + r.height / 2;
  });

  const start = await state();
  report(
    start.pos === "01" && start.prevLeft && !start.bar,
    `${name} loop`,
    `start ${start.pos}, slide ${start.total} waits on the left: ${start.prevLeft}, bar or dots: ${start.bar}`,
  );

  await p.click("#prev");
  await wait(700);
  const wrap = await state();
  report(
    wrap.on === start.total - 1,
    `${name} wrap`,
    `prev from 01 gives ${wrap.pos}/${wrap.total}`,
  );
  await p.click("#next");
  await p.click("#next");
  await wait(700);
  const two = await state();
  await p.focus("#track");
  await p.keyboard.press("ArrowRight");
  await wait(700);
  const key = await state();
  report(
    two.pos === "02" && key.pos === "03",
    `${name} buttons and keys`,
    `next x2 ${two.pos}, ArrowRight ${key.pos}`,
  );

  if (name === "desktop") {
    // Slow drag of half a slide to the left: one slide forward.
    await p.mouse.move(box.x, y);
    await p.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await p.mouse.move(box.x - (box.w * 0.6 * i) / 20, y);
      await wait(16);
    }
    await wait(150);
    await p.mouse.up();
    await wait(1200);
    const slow = await state();
    report(
      slow.pos === "04",
      `${name} drag`,
      `slow drag gives ${slow.pos} (want 04)`,
    );
    // Fast flick: the glide carries the track over more than one slide.
    await p.mouse.move(box.x, y);
    await p.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await p.mouse.move(box.x - 90 * i, y);
      await wait(8);
    }
    await p.mouse.up();
    await wait(1600);
    const flick = await state();
    const moved = (flick.on - slow.on + flick.total) % flick.total;
    report(
      moved >= 2,
      `${name} flick`,
      `fast flick moved ${moved} slides (${slow.pos} to ${flick.pos})`,
    );
    // Horizontal wheel (trackpad).
    await p.mouse.move(box.x, y);
    for (let i = 0; i < 12; i++) {
      await p.mouse.wheel({ deltaX: 60 });
      await wait(10);
    }
    await wait(900);
    const wheel = await state();
    report(
      wheel.on !== flick.on,
      `${name} wheel`,
      `horizontal wheel ${flick.pos} to ${wheel.pos}`,
    );
  } else {
    // Touch swipe to the left.
    const before = await state();
    await p.touchscreen.touchStart(box.x + box.w * 0.3, y);
    for (let i = 1; i <= 10; i++) {
      await p.touchscreen.touchMove(
        box.x + box.w * 0.3 - (box.w * 0.6 * i) / 10,
        y,
      );
      await wait(16);
    }
    await p.touchscreen.touchEnd();
    await wait(1200);
    const swipe = await state();
    report(
      swipe.on !== before.on,
      `${name} swipe`,
      `touch swipe ${before.pos} to ${swipe.pos}`,
    );
  }
  report(
    !errors.length,
    `${name} console`,
    `errors=${errors.length} ${errors.join(" | ")}`,
  );
  await p.close();
}

// Reduced motion: a key press moves the track at once, with no glide.
{
  const p = await b.newPage();
  await p.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(url, { waitUntil: "load" });
  await p.focus("#track");
  await p.keyboard.press("ArrowRight");
  const a = await p.evaluate(
    () => document.querySelector(".slide.on").getBoundingClientRect().left,
  );
  await wait(300);
  const s = await p.evaluate(() => ({
    left: document.querySelector(".slide.on").getBoundingClientRect().left,
    pos: document.getElementById("pos").textContent,
  }));
  report(
    s.pos === "02" && Math.abs(a - s.left) < 1,
    "reduced motion",
    `pos ${s.pos}, slide moved ${Math.abs(a - s.left).toFixed(1)} px after the key (want 0)`,
  );
  await p.close();
}
await b.close();
process.exit(ok ? 0 : 1);
