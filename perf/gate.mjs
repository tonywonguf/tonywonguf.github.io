// Speed gate for the site.
// Usage: node perf/gate.mjs [DIR] [RUNS]
// It serves DIR (default dist) with gzip, like GitHub Pages, and runs Lighthouse on a simulated phone RUNS times (default 3).
// It prints the median of each value and exits with 1 if a value is outside the budget.
// It needs the packages lighthouse and chrome-launcher, and CHROME_PATH set to a Chromium binary.
// The site itself does not use these packages.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { extname, join, normalize } from "node:path";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const dir = process.argv[2] || "dist";
const runs = Number(process.argv[3] || 3);
const types = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".css": "text/css",
  ".js": "text/javascript",
};

const server = http.createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(req.url.split("?")[0])).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  if (p.endsWith("/")) p += "index.html";
  try {
    let body = await readFile(join(dir, p));
    const type = types[extname(p)] || "application/octet-stream";
    const headers = { "Content-Type": type, "Cache-Control": "max-age=600" };
    if (
      /text|javascript/.test(type) &&
      /gzip/.test(req.headers["accept-encoding"] || "")
    ) {
      body = gzipSync(body, { level: 9 });
      headers["Content-Encoding"] = "gzip";
    }
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const budget = {
  performance: [">=", 98],
  accessibility: [">=", 98],
  "best-practices": [">=", 98],
  seo: [">=", 98],
  "lcp-ms": ["<", 1200],
  cls: ["<", 0.02],
  "tbt-ms": ["<=", 0],
  "first-load-kb": ["<", 100],
};

const results = [];
for (let i = 0; i < runs; i++) {
  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const { lhr } = await lighthouse(url, {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    formFactor: "mobile",
    throttlingMethod: "simulate",
  });
  await chrome.kill();
  const a = lhr.audits;
  const r = {
    performance: Math.round(lhr.categories.performance.score * 100),
    accessibility: Math.round(lhr.categories.accessibility.score * 100),
    "best-practices": Math.round(lhr.categories["best-practices"].score * 100),
    seo: Math.round(lhr.categories.seo.score * 100),
    "lcp-ms": Math.round(a["largest-contentful-paint"].numericValue),
    cls: Number(a["cumulative-layout-shift"].numericValue.toFixed(3)),
    "tbt-ms": Math.round(a["total-blocking-time"].numericValue),
    "first-load-kb": Number(
      (a["total-byte-weight"].numericValue / 1024).toFixed(1),
    ),
    "fcp-ms": Math.round(a["first-contentful-paint"].numericValue),
  };
  const failed = Object.values(lhr.categories)
    .flatMap((c) => c.auditRefs.map((ref) => a[ref.id]))
    .filter(
      (x) =>
        x &&
        x.score !== null &&
        x.score < 0.9 &&
        x.scoreDisplayMode !== "informative" &&
        x.scoreDisplayMode !== "notApplicable" &&
        x.scoreDisplayMode !== "manual",
    )
    .map((x) => x.id);
  results.push(r);
  if (r["tbt-ms"] > 0) {
    const tasks = (a["long-tasks"].details?.items || []).map(
      (t) =>
        `${t.url} start ${Math.round(t.startTime)} ms, ${Math.round(t.duration)} ms`,
    );
    const work = (a["mainthread-work-breakdown"].details?.items || []).map(
      (t) => `${t.group} ${Math.round(t.duration)}`,
    );
    console.log(
      `  long tasks: ${tasks.join("; ")}\n  main thread: ${work.join(", ")}`,
    );
  }
  if (i === 0)
    for (const id of new Set(failed))
      for (const item of (a[id].details?.items || []).slice(0, 4))
        if (item.node) console.log(`  ${id}: ${item.node.snippet}`);
  console.log(
    `run ${i + 1}: ${JSON.stringify(r)}${failed.length ? ` low audits: ${[...new Set(failed)].join(", ")}` : ""}`,
  );
}
server.close();

const median = (k) => {
  const v = results.map((r) => r[k]).sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)];
};
let ok = true;
for (const [k, [op, limit]] of Object.entries(budget)) {
  const v = median(k);
  const pass = op === ">=" ? v >= limit : op === "<" ? v < limit : v <= limit;
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"} ${k} = ${v} (budget ${op} ${limit})`);
}
process.exit(ok ? 0 : 1);
