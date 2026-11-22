// Build the site into dist/.
// Usage: node src/build.mjs [--offline]
// --offline uses data/repos.json from the last build and does not call GitHub.

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { selectRepos } from "./repos.mjs";

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

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const month = (d) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const day = (d) =>
  d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const project = (r) => `
        <li class="project">
          <h3><a href="${esc(r.url)}">${esc(r.name)}</a></h3>
          ${r.description ? `<p>${esc(r.description)}</p>` : ""}
          <p class="meta">${[r.language, `Updated ${month(r.pushed)}`].filter(Boolean).map(esc).join(", ")}${
            r.homepage ? `, <a href="${esc(r.homepage)}">live site</a>` : ""
          }</p>
        </li>`;

const tile = (area, title, body, extra = "") => `
    <section class="tile tile-${area}" aria-labelledby="t-${area}"${extra}>
      <h2 class="bar" id="t-${area}">${esc(title)}</h2>
      <div class="body">${body}
      </div>
    </section>`;

const list = (items) => `
        <ul class="plain">${items.map((t) => `\n          <li>${esc(t)}</li>`).join("")}
        </ul>`;

const links = Object.entries(site.links)
  .filter(([, url]) => url)
  .map(
    ([name, url]) =>
      `<a href="${esc(url)}">${name === "github" ? "GitHub" : name === "linkedin" ? "LinkedIn" : esc(name)}</a>`,
  )
  .join("\n          ");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(site.name)}</title>
  <meta name="description" content="${esc(site.intro)}">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%231f6f64'/%3E%3Crect y='0' width='16' height='3' fill='%23e3e8ee'/%3E%3C/svg%3E">
  <link rel="preload" href="fonts/schibsted-grotesk.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="desk">
    <section class="tile tile-hero" aria-labelledby="name">
      <p class="bar" aria-hidden="true">${esc(site.githubUser)}</p>
      <div class="body">
        <h1 id="name">${esc(site.name)}</h1>
        <p class="intro">${esc(site.intro)}</p>
        <nav class="links" aria-label="Links">
          ${links}
        </nav>
      </div>
    </section>
${tile("now", "What I work on now", list(site.now))}
${tile("ai", "What I use AI for", list(site.ai))}
${tile(
  "builds",
  "What I build",
  recent.length
    ? `
        <ul class="plain projects">${recent.map(project).join("")}
        </ul>`
    : `
        <p>No public projects were updated recently. Older work is in the next part.</p>`,
)}
${
  earlier.length
    ? tile(
        "earlier",
        "Earlier work",
        `
        <ul class="plain projects">${earlier.map(project).join("")}
        </ul>`,
      )
    : ""
}
  </main>
  <footer class="foot">
    <p>This page is built from my public GitHub repositories. Last build: ${day(now)}.</p>
  </footer>
</body>
</html>
`;

await rm(path("dist"), { recursive: true, force: true });
await mkdir(path("dist/fonts"), { recursive: true });
await writeFile(path("dist/index.html"), html);
await cp(path("src/style.css"), path("dist/style.css"));
await cp(path("assets/fonts"), path("dist/fonts"), { recursive: true });
console.log(
  `Built dist/index.html: ${recent.length} recent, ${earlier.length} earlier, ${refused.length} not listed.`,
);
