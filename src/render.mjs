// Make the HTML page and llms.txt from the site text and the selected repositories.
// This module does not read files or use the network, so the tests can call it directly.

import { agentArt } from "./agent-art.mjs";

export const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// "*word*" in the site text becomes an accent in italic.
const accent = (s) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");
const plain = (s) => String(s).replace(/\*/g, "");

const month = (d) =>
  d.toLocaleDateString("en-US", {
    month: "short",
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
const pad = (n) => String(n).padStart(2, "0");
const slug = (name) => "p-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const linkName = (name) =>
  name === "github" ? "GitHub" : name === "linkedin" ? "LinkedIn" : name;

const card = (r, i, total) => `
        <li class="card" id="${slug(r.name)}">
          <div class="card-top"><span>${pad(i + 1)} / ${pad(total)}</span><span class="arrow" aria-hidden="true">&#8599;</span></div>
          <h3><a href="${esc(r.url)}">${esc(r.name)}</a></h3>
          ${r.description ? `<p>${esc(r.description)}</p>` : ""}
          <ul class="tags" aria-label="Details">
            ${r.language ? `<li>${esc(r.language)}</li>` : ""}
            <li><time datetime="${r.pushed.toISOString().slice(0, 10)}">Updated ${month(r.pushed)}</time></li>
            ${r.homepage ? `<li><a href="${esc(r.homepage)}">Live site</a></li>` : ""}
          </ul>
        </li>`;

const row = (r) => `
          <li>
            <a href="${esc(r.url)}">${esc(r.name)}</a>
            <span class="meta">${[r.language, r.pushed.getUTCFullYear()].filter(Boolean).map(esc).join(" · ")}</span>
            ${r.description ? `<p>${esc(r.description)}</p>` : ""}
          </li>`;

const notes = (items) => `
        <ul class="notes">${items.map((t) => `\n          <li>${esc(t)}</li>`).join("")}
        </ul>`;

export function renderPage({ site, recent, earlier, now, css, script, fonts }) {
  const links = Object.entries(site.links).filter(([, url]) => url);
  const navLinks = links
    .map(
      ([n, url]) =>
        `<a href="${esc(url)}" rel="me">${esc(linkName(n))} &#8599;</a>`,
    )
    .join("\n        ");
  const ls = recent
    .map((r) => `<a href="#${slug(r.name)}">${esc(r.name)}/</a>`)
    .join(" ");
  const who = [
    site.name.toLowerCase(),
    site.role.toLowerCase(),
    site.languages.join(", ").toLowerCase(),
  ].join(" · ");
  const description = plain(site.intro);
  const title = `${site.name}, ${site.role.toLowerCase()}`;
  const preload = fonts
    .map(
      (f) =>
        `<link rel="preload" href="fonts/${f}" as="font" type="font/woff2" crossorigin>`,
    )
    .join("\n  ");
  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Person",
    name: site.name,
    url: site.siteUrl,
    jobTitle: site.role,
    sameAs: links.map(([, url]) => url),
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(site.siteUrl)}">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(site.siteUrl)}">
  <meta name="theme-color" content="#f4f2ed" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#131311" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%230d6b5b'/%3E%3Ccircle cx='5.5' cy='8' r='1.6' fill='%23f4f2ed'/%3E%3Ccircle cx='10.5' cy='8' r='1.6' fill='%23f4f2ed'/%3E%3C/svg%3E">
  <link rel="alternate" type="text/plain" href="llms.txt" title="Text for AI assistants">
  ${preload}
  <style>${css}</style>
  <script type="application/ld+json">${ld}</script>
</head>
<body>
  <a class="skip" href="#work">Skip to projects</a>
  <header class="wrap top">
    <a class="home" href="#top" id="top">${esc(site.githubUser)}</a>
    <nav aria-label="Sections and profiles">
        <a href="#work">Work</a>
        <a href="#now">Now</a>
        <a href="#ai">AI</a>
        ${navLinks}
    </nav>
  </header>
  <main>
    <section class="wrap hero" aria-labelledby="name">
      <div class="hero-text">
        <h1 id="name">${esc(site.name)}</h1>
        <p class="lede">${accent(site.headline)}</p>
        <p class="facts">${esc(site.education)}.</p>
        <div class="shell" aria-label="Summary in the form of terminal output">
          <p class="cmd">whoami</p>
          <p>${esc(who)}</p>
          <p class="cmd">ls ~/build</p>
          <p>${ls || "(empty)"}</p>
        </div>
      </div>
      <pre class="agent" id="agent" aria-hidden="true">${agentArt(1, 1, "open")}</pre>
    </section>

    <section class="part" id="work" aria-labelledby="t-work">
      <div class="wrap">
        <div class="part-head">
          <h2 id="t-work">What I build</h2>
          <span class="count">${recent.length} active, from GitHub</span>
        </div>
        ${
          recent.length
            ? `<ul class="cards">${recent.map((r, i) => card(r, i, recent.length)).join("")}
        </ul>`
            : `<p>No public projects were updated recently. Older work is below.</p>`
        }${
          earlier.length
            ? `
        <h3 class="sub">Earlier work</h3>
        <ul class="rows">${earlier.map(row).join("")}
        </ul>`
            : ""
        }
      </div>
    </section>

    <section class="part" id="now" aria-labelledby="t-now">
      <div class="wrap">
        <div class="part-head"><h2 id="t-now">What I work on now</h2></div>${notes(site.now)}
      </div>
    </section>

    <section class="part" id="ai" aria-labelledby="t-ai">
      <div class="wrap">
        <div class="part-head"><h2 id="t-ai">How I use AI</h2></div>${notes(site.ai)}
      </div>
    </section>
  </main>
  <footer class="wrap foot">
    <p>This page is built from my public GitHub repositories. Last build: ${day(now)}.</p>
    <p><a href="${esc(site.links.github)}/${esc(site.githubUser)}.github.io">Source</a> · <a href="llms.txt">llms.txt</a> (this page as plain text, for AI assistants)</p>
  </footer>
  <script>const agentArt=${agentArt.toString().replace(/^function agentArt/, "function")};
${script}</script>
</body>
</html>
`;
}

export function renderLlms({ site, recent, earlier, now }) {
  const item = (r) =>
    `- [${r.name}](${r.url})${r.description ? `: ${r.description}` : ""}${r.language ? ` (${r.language})` : ""}`;
  return `# ${site.name}

> ${plain(site.intro)}

${site.education}. Languages: ${site.languages.join(", ")}.

## Profiles

${Object.entries(site.links)
  .filter(([, url]) => url)
  .map(([n, url]) => `- [${linkName(n)}](${url})`)
  .join("\n")}

## What I build

${recent.map(item).join("\n") || "- No public projects were updated recently."}
${earlier.length ? `\n## Earlier work\n\n${earlier.map(item).join("\n")}\n` : ""}
## What I work on now

${site.now.map((t) => `- ${t}`).join("\n")}

## How I use AI

${site.ai.map((t) => `- ${t}`).join("\n")}

Last build: ${day(now)}. The list contains only public GitHub repositories.
`;
}
