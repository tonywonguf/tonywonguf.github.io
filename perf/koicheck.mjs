// Make sure that the koi pond loads late and draws.
// 1. Before the pond comes near the screen, the page does not request a file in koi/.
// 2. When the pond is on the screen, the page gets the renderer and the swim sheet, and the canvas shows the koi.
// 3. The koi moves. With reduced motion, the koi stays still.
// 4. The page writes no console errors.
// It saves screenshots of the pond to the folder OUT.
// Usage: node perf/koicheck.mjs URL OUT
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const [url, out = "."] = process.argv.slice(2);
const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
  ],
});
let ok = true;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = (pass, name, text) => {
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${text}`);
};

// Screenshot of the canvas, then the page decodes it and gives a fingerprint:
// the number of colors, the share of light pixels (the white koi) and a hash.
const look = async (p, file) => {
  const el = await p.$("#koi");
  const png = await el.screenshot({ encoding: "base64" });
  await writeFile(file, Buffer.from(png, "base64"));
  return p.evaluate(async (data) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const colors = new Set();
    let light = 0;
    let hash = 0;
    for (let i = 0; i < d.length; i += 4) {
      colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      if (d[i] + d[i + 1] + d[i + 2] > 560) light++;
      hash = (hash * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) % 1e9;
    }
    return { colors: colors.size, light: light / (d.length / 4), hash };
  }, png);
};

for (const [name, vp] of [
  ["desktop", { width: 1440, height: 900 }],
  ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }],
]) {
  for (const motion of ["no-preference", "reduce"]) {
    const tag = `${name} ${motion === "reduce" ? "reduced motion" : "motion"}`;
    const p = await b.newPage();
    const errors = [];
    const koiFiles = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    p.on(
      "request",
      (r) =>
        r.url().includes("/koi/") && koiFiles.push(r.url().split("/koi/")[1]),
    );
    await p.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: motion },
    ]);
    await p.setViewport(vp);
    await p.goto(url, { waitUntil: "load" });
    // app.js comes 0.9 s after the load event.
    await wait(2500);
    report(
      koiFiles.length === 0,
      `${tag} late load`,
      `${koiFiles.length} koi files before scroll`,
    );
    await p.evaluate(() =>
      document.getElementById("pond").scrollIntoView({ block: "center" }),
    );
    await p
      .waitForSelector(".pond.on, .pond.off", { timeout: 15000 })
      .catch(() => {});
    await wait(1200);
    const state = await p.evaluate(() => ({
      on: document.querySelector(".pond").classList.contains("on"),
      webgl2: !!document.getElementById("koi").getContext("webgl2"),
    }));
    const need = [
      "koi-grain.js",
      "koi-motion.js",
      "koi.json",
      "white-swim.json",
      "white-swim.webp",
    ];
    const missing = need.filter((f) => !koiFiles.includes(f));
    report(
      state.on && missing.length === 0,
      `${tag} loaded`,
      `pond on=${state.on}, webgl2=${state.webgl2}, files: ${[...new Set(koiFiles)].join(", ")}`,
    );
    const a = await look(p, `${out}/koi-${name}-${motion}-a.png`);
    await wait(700);
    const z = await look(p, `${out}/koi-${name}-${motion}-b.png`);
    report(
      a.colors > 6 && a.light > 0.0005,
      `${tag} draws`,
      `${a.colors} colors, ${(a.light * 100).toFixed(2)}% light pixels`,
    );
    if (motion === "reduce")
      report(
        a.hash === z.hash,
        `${tag} still`,
        a.hash === z.hash
          ? "two frames 0.7 s apart are the same"
          : "the frames are different",
      );
    else
      report(
        a.hash !== z.hash,
        `${tag} moves`,
        a.hash !== z.hash
          ? "two frames 0.7 s apart are different"
          : "the frames are the same",
      );
    report(
      errors.length === 0,
      `${tag} console`,
      errors.length ? errors.join(" | ") : "0 errors",
    );
    if (motion === "no-preference") {
      // Scroll away and back: the pond must start only one time.
      await p.evaluate(() => scrollTo(0, 0));
      await wait(600);
      await p.evaluate(() => document.getElementById("pond").scrollIntoView({ block: "center" }));
      await wait(1200);
      const starts = koiFiles.filter((f) => f === "koi.json").length;
      report(starts === 1, `${tag} one start`, `koi.json requested ${starts} times`);
    }
    await p.close();
  }
}
await b.close();
console.log(ok ? "koicheck PASS" : "koicheck FAIL");
process.exit(ok ? 0 : 1);
