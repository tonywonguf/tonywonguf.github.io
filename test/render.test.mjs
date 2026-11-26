import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import { selectRepos } from "../src/repos.mjs";
import { renderPage, renderLlms } from "../src/render.mjs";
import { agentArt } from "../src/agent-art.mjs";

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
  assert.match(html, /aria-hidden="true">/);
  assert.equal((html.match(/rel="preload"/g) || []).length, fonts.length);
  assert.match(html, /href="https:\/\/b.example">Live site/);
  assert.doesNotMatch(html, /<script src=/);
  assert.doesNotMatch(html, /<link rel="stylesheet"/);
});

test("each line of the agent has the same width in each position", () => {
  const strip = (s) => s.replace(/<[^>]+>/g, "").split("\n");
  const base = strip(agentArt(1, 1, "open")).map((l) => l.length);
  for (const mode of ["open", "blink", "happy"])
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 3; r++)
        assert.deepEqual(
          strip(agentArt(c, r, mode)).map((l) => l.length),
          base,
        );
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
  for (const f of fonts)
    bytes += (await stat(new URL(`fonts/${f}`, dist))).size;
  assert.ok(bytes < 100 * 1024, `first load is ${bytes} bytes`);
});
