// Make sure that the dither effects start: dithered covers, the hero glow and the glyph canvas of the stage.
// Also make sure that a click on the stage throws the glyphs and that they come home,
// and that reduced motion keeps the stage still. It saves screenshots to the folder OUT.
// Usage: node perf/effectcheck.mjs URL OUT
import puppeteer from "puppeteer-core";

const [url, out = "."] = process.argv.slice(2);
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
// A short fingerprint of the glyph canvas, and the number of pixels that are not empty.
const snap = (p) =>
  p.evaluate(() => {
    const c = document.querySelector(".glyphs");
    if (!c) return { n: 0, sum: 0 };
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    let sum = 0;
    for (let i = 3; i < d.length; i += 16)
      if (d[i]) {
        n++;
        sum = (sum + i * d[i]) % 1e9;
      }
    // The width of the box around the glyph pixels, in canvas pixels.
    let x0 = c.width;
    let x1 = 0;
    for (let i = 3; i < d.length; i += 16)
      if (d[i]) {
        const x = ((i - 3) / 4) % c.width;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    return { n, sum, span: x1 - x0 };
  });

for (const scheme of ["light", "dark"]) {
  for (const [name, vp] of [
    ["desktop", { width: 1440, height: 900 }],
    ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ]) {
    const p = await b.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await p.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: scheme },
    ]);
    await p.setViewport(vp);
    await p.goto(url + "?season=turkey", { waitUntil: "load" });
  await p.waitForFunction(() => (document.querySelector(".carousel.js") || !document.querySelector(".carousel")) && document.getElementById("stage")?.classList.contains("live"), { timeout: 8000 });
    await wait(1500);
    const s = await p.evaluate(() => ({
      covers: document.querySelectorAll(".cover").length,
      dith: document.querySelectorAll(".cover.dith").length,
      glow: !!document.querySelector(".glow.on"),
      live: document.getElementById("stage").classList.contains("live"),
    }));
    const g = await snap(p);
    report(
      s.dith === s.covers && s.glow && s.live && g.n > 50,
      `${scheme} ${name} start`,
      `covers ${s.dith}/${s.covers} dithered, glow ${s.glow}, stage live ${s.live}, glyph pixels ${g.n}`,
    );
    await p.screenshot({ path: `${out}/fx-${name}-${scheme}.png` });
    await p.evaluate(() =>
      document.getElementById("stage").scrollIntoView({ block: "center" }),
    );
    await wait(400);
    await p.screenshot({ path: `${out}/fx-${name}-${scheme}-stage.png` });
    if (name === "desktop" && scheme === "light") {
      // Click on the turkey: the glyphs fly, then come home.
      const at = await p.evaluate(() => {
        const r = document.querySelector(".walker").getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      });
      const before = await snap(p);
      await p.mouse.click(at[0], at[1]);
      await wait(250);
      const fly = await snap(p);
      await p.screenshot({ path: `${out}/fx-scatter.png` });
      await p.mouse.move(5, 5);
      await wait(3500);
      const home = await snap(p);
      report(
        fly.span > before.span * 1.3 && Math.abs(home.span - before.span) / before.span < 0.15,
        "scatter",
        `glyph box width before ${before.span}, flying ${fly.span}, home ${home.span}`,
      );
      await p.evaluate(() =>
        scrollTo(0, document.getElementById("work").offsetTop),
      );
      await wait(500);
      await p.screenshot({ path: `${out}/fx-covers.png` });
    }
    report(
      !errors.length,
      `${scheme} ${name} console`,
      `errors=${errors.length} ${errors.join(" | ")}`,
    );
    await p.close();
  }
}
// Reduced motion: the stage is drawn, and it does not change.
{
  const p = await b.newPage();
  await p.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(url, { waitUntil: "load" });
  await p.waitForFunction(() => (document.querySelector(".carousel.js") || !document.querySelector(".carousel")) && document.getElementById("stage")?.classList.contains("live"), { timeout: 8000 });
  await wait(1200);
  const a = await snap(p);
  await p.mouse.click(1000, 500);
  await wait(1500);
  const c = await snap(p);
  report(
    a.n > 50 && a.sum === c.sum,
    "reduced motion",
    `glyph pixels ${a.n}, same after 1.5 s and a click: ${a.sum === c.sum}`,
  );
  await p.close();
}
// Winter: the tree and the reindeer are glyphs too.
{
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(url + "?season=tree", { waitUntil: "load" });
  await p.waitForFunction(() => (document.querySelector(".carousel.js") || !document.querySelector(".carousel")) && document.getElementById("stage")?.classList.contains("live"), { timeout: 8000 });
  await wait(1500);
  await p.evaluate(() =>
    document.getElementById("stage").scrollIntoView({ block: "center" }),
  );
  await wait(400);
  const a = await snap(p);
  await wait(500);
  const c = await snap(p);
  report(
    a.n > 50 && a.sum !== c.sum,
    "winter",
    `glyph pixels ${a.n}, tree turns: ${a.sum !== c.sum}`,
  );
  await p.screenshot({ path: `${out}/fx-winter.png` });
  await p.close();
}
await b.close();
process.exit(ok ? 0 : 1);
