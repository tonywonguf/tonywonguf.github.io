// Make sure that the arrow buttons and the arrow keys move the project carousel, and that the counter follows.
// Usage: node perf/carouselcheck.mjs URL
import puppeteer from "puppeteer-core";

const url = process.argv[2];
const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--no-sandbox"],
});
let ok = true;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
    p.evaluate(() => ({
      pos: document.getElementById("pos").textContent,
      on: [...document.querySelectorAll(".slide")].findIndex((s) => s.classList.contains("on")),
      total: document.querySelectorAll(".slide").length,
    }));
  const start = await state();
  await p.click("#next");
  await wait(900);
  const afterNext = await state();
  await p.focus("#track");
  await p.keyboard.press("ArrowRight");
  await wait(900);
  const afterKey = await state();
  await p.click("#prev");
  await p.click("#prev");
  await wait(900);
  const back = await state();
  await p.click("#prev");
  await wait(900);
  const wrap = await state();
  const pass =
    start.pos === "01" && start.on === 0 &&
    afterNext.pos === "02" && afterNext.on === 1 &&
    afterKey.pos === "03" &&
    wrap.on === start.total - 1 &&
    !errors.length;
  if (!pass) ok = false;
  console.log(
    `${pass ? "PASS" : "FAIL"} ${name}: start ${start.pos}, next ${afterNext.pos}, key ${afterKey.pos}, back ${back.pos}, wrap ${wrap.pos}/${wrap.total}, errors=${errors.length} ${errors.join(" | ")}`,
  );
  await p.close();
}
await b.close();
process.exit(ok ? 0 : 1);
