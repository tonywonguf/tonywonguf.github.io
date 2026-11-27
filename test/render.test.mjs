import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import { selectRepos } from "../src/repos.mjs";
import { renderPage, renderLlms } from "../src/render.mjs";

const now = new Date("2026-11-22T00:00:00Z");
const site = JSON.parse(
  await readFile(new URL("../content/site.json", import.meta.url), "utf8"),
);
const repo = (name, extra = {}) => ({
  name,
  private: false,
  visibility: "public",
  fork: false,
  archived: false,
  html_url: `https://github.com/tonywonguf/${name}`,
  homepage: null,
  description: "d",
  language: "Rust",
  pushed_at: "2026-11-20T00:00:00Z",
  ...extra,
});
const fonts = [
  "schibsted-grotesk-400.woff2",
  "schibsted-grotesk-700.woff2",
  "schibsted-grotesk-italic.woff2",
];

function build(repos) {
  const { recent, earlier } = selectRepos(repos, site.projects, now);
  const input = { site, recent, earlier, now, css: "", script: "", fonts };
  return { html: renderPage(input), llms: renderLlms(input) };
}

test("the page and llms.txt do not contain a private or internal repo", () => {
  const { html, llms } = build([
    repo("open-tool"),
    repo("secret-tool", { private: true, visibility: "private" }),
    repo("inner-tool", { visibility: "internal" }),
  ]);
  for (const out of [html, llms]) {
    assert.match(out, /open-tool/);
    assert.doesNotMatch(out, /secret-tool/);
    assert.doesNotMatch(out, /inner-tool/);
  }
});

test("repository text is escaped", () => {
  const { html } = build([
    repo("x", { description: '<img src=x onerror="alert(1)">' }),
  ]);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test("the page has the parts that the tests of the speed budget need", () => {
  const { html } = build([
    repo("a"),
    repo("b", { homepage: "https://b.example" }),
  ]);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.match(html, /<h1 id="name">Tony Wong<\/h1>/);
  assert.equal((html.match(/rel="preload"/g) || []).length, fonts.length);
  assert.match(html, /href="https:\/\/b.example">Live site/);
  // No script file blocks the first paint: the page asks for app.js only after the load event.
  assert.doesNotMatch(html, /<script src=/);
  assert.match(html, /addEventListener\("load",[^<]*src:"app.js"\}\)\),900\)/);
  assert.doesNotMatch(html, /<link rel="stylesheet"/);
});

test("the carousel has one slide for each recent project, and only the first is on", () => {
  const { html } = build([repo("a"), repo("b"), repo("c")]);
  const slides = html.match(/<div class="slide[^"]*" id="p-[^"]+" role="group" aria-roledescription="slide"/g) || [];
  assert.equal(slides.length, 3);
  assert.equal((html.match(/class="slide on"/g) || []).length, 1);
  assert.match(html, /aria-label="1 of 3: a"/);
  assert.match(html, /aria-roledescription="carousel"/);
  assert.match(html, /<button type="button" class="nav" id="prev"/);
  assert.match(html, /<span id="pos">01<\/span> \/ 03/);
});

test("each project gets the same cover at each build", () => {
  const a = build([repo("same-name")]).html.match(/class="cover" [^>]*style="([^"]+)"/)[1];
  const b = build([repo("same-name")]).html.match(/class="cover" [^>]*style="([^"]+)"/)[1];
  assert.equal(a, b);
  assert.match(a, /^--h:\d+;--x:\d+%;--y:\d+%;--a:\d+deg$/);
});

test("the built page is under the first-load budget", async (t) => {
  const dist = new URL("../dist/", import.meta.url);
  let html;
  try {
    html = await readFile(new URL("index.html", dist));
  } catch {
    t.skip("dist/ is not built");
    return;
  }
  let bytes = gzipSync(html).length;
  // The page must fit in the first TCP window, so the first paint needs one round trip.
  assert.ok(bytes < 14 * 1024, `the gzipped page is ${bytes} bytes`);
  bytes += gzipSync(await readFile(new URL("app.js", dist))).length;
  for (const f of fonts)
    bytes += (await stat(new URL(`fonts/${f}`, dist))).size;
  assert.ok(bytes < 100 * 1024, `first load is ${bytes} bytes`);
});
