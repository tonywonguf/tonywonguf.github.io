// Make sure that the agent follows the pointer, and stays still when the reader asks for reduced motion.
// Usage: node perf/agentcheck.mjs URL
import puppeteer from "puppeteer-core";

const url = process.argv[2];
const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--no-sandbox"],
});
let ok = true;
const eyes = (p) =>
  p.$eval("#agent", (el) =>
    el.textContent
      .split("\n")
      .slice(5, 8)
      .map((l) => l.slice(4, 7))
      .join("|"),
  );
for (const motion of ["no-preference", "reduce"]) {
  const p = await b.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: motion },
  ]);
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(url, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 700));
  const start = await eyes(p);
  await p.mouse.move(5, 5);
  await new Promise((r) => setTimeout(r, 200));
  const topLeft = await eyes(p);
  await p.mouse.move(1275, 795);
  await new Promise((r) => setTimeout(r, 200));
  const bottomRight = await eyes(p);
  const moved = start !== topLeft && topLeft !== bottomRight;
  const want = motion === "reduce" ? !moved : moved;
  if (!want || errors.length) ok = false;
  console.log(
    `${want && !errors.length ? "PASS" : "FAIL"} motion=${motion}: start [${start}] top-left [${topLeft}] bottom-right [${bottomRight}] errors=${errors.length}`,
  );
  await p.close();
}
await b.close();
process.exit(ok ? 0 : 1);
