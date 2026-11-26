// Screenshots of the built site at phone, tablet and desktop width, light and dark.
// Usage: node perf/shots.mjs URL OUTDIR
// It needs puppeteer-core and CHROME_PATH. It also makes a screenshot of the project carousel.

import puppeteer from "puppeteer-core";

const [url, out = "shots"] = process.argv.slice(2);
const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const views = [
  [
    "phone",
    {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  ],
  [
    "tablet",
    {
      width: 820,
      height: 1180,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
  ],
  ["desktop", { width: 1440, height: 900 }],
];
for (const scheme of ["light", "dark"])
  for (const [name, vp] of views) {
    const p = await b.newPage();
    await p.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: scheme },
    ]);
    await p.setViewport(vp);
    await p.goto(url, { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 800));
    await p.screenshot({ path: `${out}/${name}-${scheme}.png` });
    await p.evaluate(() => scrollTo(0, document.getElementById("work").offsetTop));
    await new Promise((r) => setTimeout(r, 500));
    await p.screenshot({ path: `${out}/${name}-${scheme}-work.png` });
    await p.evaluate(() => scrollTo(0, 0));
    if (scheme === "light")
      await p.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    );
    console.log(name, scheme, "horizontal overflow px:", overflow);
    await p.close();
  }
await b.close();
