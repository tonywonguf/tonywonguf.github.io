// Build the site into dist/.
// Usage: node src/build.mjs [--offline]
// --offline uses data/repos.json from the last build and does not call GitHub.

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { selectRepos } from "./repos.mjs";
import { renderPage, renderLlms } from "./render.mjs";
import * as art from "./art.mjs";

const root = new URL("..", import.meta.url);
const path = (p) => new URL(p, root);
const offline = process.argv.includes("--offline");

const site = JSON.parse(await readFile(path("content/site.json"), "utf8"));

async function fetchRepos(user) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "personal-site-build",
  };
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  // This endpoint gives only public repositories. selectRepos examines the visibility again.
  const url = `https://api.github.com/users/${user}/repos?type=owner&per_page=100&sort=pushed`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status} for ${url}`);
  return res.json();
}

let repos;
if (offline) {
  repos = JSON.parse(await readFile(path("data/repos.json"), "utf8"));
} else {
  repos = await fetchRepos(site.githubUser);
  await mkdir(path("data"), { recursive: true });
  const keep = [
    "name",
    "private",
    "visibility",
    "fork",
    "archived",
    "html_url",
    "homepage",
    "description",
    "language",
    "pushed_at",
  ];
  const slim = repos.map((r) => Object.fromEntries(keep.map((k) => [k, r[k]])));
  await writeFile(
    path("data/repos.json"),
    JSON.stringify(slim, null, 2) + "\n",
  );
}

const now = new Date();
const { recent, earlier, refused } = selectRepos(repos, site.projects, now);
if (refused.length)
  console.warn(
    `Not listed, because GitHub does not report them as public: ${refused.join(", ")}`,
  );

// Remove comments and extra white space from the CSS before it goes inline.
const minifyCss = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
// Remove the comment lines and the indent from the agent script.
const minifyJs = (s) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .join("\n");

const fonts = ["schibsted-grotesk-400.woff2",
  "schibsted-grotesk-700.woff2",
  "schibsted-grotesk-italic.woff2",];
const input = {
  site,
  recent,
  earlier,
  now,
  css: minifyCss(await readFile(path("src/style.css"), "utf8")),
  // The carousel, then the art functions (as source) and the stage that uses them.
  // They go to dist/app.js. The page loads it 0.9 s after the load event: inline, the gzipped page
  // would not fit in the first TCP window (about 14 KB), and as an early request it would delay
  // the fonts and so the largest paint. On a fast computer the load event comes before the largest
  // paint, so the page waits 0.9 s more. Until app.js runs, the carousel is a scroll-snap track.
  script: minifyJs(
    [
      await readFile(path("src/carousel.js"), "utf8"),
      ...["turkey", "tree", "reindeer", "frameHtml"].map((n) => art[n].toString()),
      await readFile(path("src/site.js"), "utf8"),
      await readFile(path("src/koi.js"), "utf8"),
    ].join("\n"),
  ),
  fonts,
};

await rm(path("dist"), { recursive: true, force: true });
await mkdir(path("dist/fonts"), { recursive: true });
await writeFile(path("dist/index.html"), renderPage(input));
await writeFile(path("dist/llms.txt"), renderLlms(input));
await writeFile(path("dist/app.js"), input.script);
for (const f of [...fonts, "OFL.txt"])
  await cp(path(`assets/fonts/${f}`), path(`dist/fonts/${f}`));
// The koi pond: the koi-grain renderer, one swim sheet and the license files.
// The page gets these files only when the pond section comes near the screen (src/koi.js).
await cp(path("assets/koi"), path("dist/koi"), { recursive: true });
console.log(
  `Built dist/index.html: ${recent.length} recent, ${earlier.length} earlier, ${refused.length} not listed.`,
);
