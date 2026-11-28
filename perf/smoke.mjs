// Smoke check of one page: the script starts, the carousel and the stage go live,
// every request answers with a status under 400, and the console has no errors.
// Use it on dist/ before a deploy, on the live site after a deploy, and on the Playground card.
// Usage: node perf/smoke.mjs URL
import puppeteer from "puppeteer-core";

const url = process.argv[2];
const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--no-sandbox"],
});
const p = await b.newPage();
const bad = [];
p.on("pageerror", (e) => bad.push(`page error: ${e.message}`));
p.on(
  "console",
  (m) => m.type() === "error" && bad.push(`console: ${m.text()}`),
);
p.on("requestfailed", (r) =>
  bad.push(`failed: ${r.url()} ${r.failure()?.errorText}`),
);
p.on(
  "response",
  (r) => r.status() >= 400 && bad.push(`status ${r.status()}: ${r.url()}`),
);
await p.setViewport({ width: 1440, height: 900 });
await p.goto(url, { waitUntil: "load" });
let live = true;
try {
  await p.waitForFunction(
    () =>
      document.querySelector(".carousel.js") &&
      document.getElementById("stage")?.classList.contains("live"),
    { timeout: 10000 },
  );
} catch {
  live = false;
  bad.push(
    "app.js did not start: no .carousel.js or no #stage.live after 10 s",
  );
}
const info = await p.evaluate(() => ({
  slides: document.querySelectorAll(".slide").length,
  canvases: document.querySelectorAll("canvas").length,
}));
await b.close();
const ok = live && !bad.length && info.slides > 0;
console.log(
  `${ok ? "PASS" : "FAIL"} smoke ${url}: slides ${info.slides}, canvases ${info.canvases}`,
);
for (const line of bad) console.log(`  ${line}`);
process.exit(ok ? 0 : 1);
