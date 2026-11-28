import { turkey, frameHtml } from "./art.mjs";

// Make the HTML page and llms.txt from the site text and the selected repositories.
// This module does not read files or use the network, so the tests can call it directly.

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

// A small number from the name, so each project gets the same cover at each build.
const seed = (name) => {
  let h = 2166136261;
  for (const c of name) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
};
// The base hue of the cover comes from the language.
const hues = { Rust: 22, Go: 190, Python: 210, "C++": 330, C: 260, Shell: 120, Ruby: 355, JavaScript: 48, TypeScript: 215 };
const coverStyle = (r) => {
  const n = seed(r.name);
  // Projects of one language stay near one hue, but each project moves it a little.
  const hue = ((hues[r.language] ?? n % 360) + ((n >>> 4) % 120) - 60 + 360) % 360;
  const x = 15 + (n % 70);
  const y = 10 + ((n >>> 8) % 80);
  const a = (n >>> 16) % 180;
  return `--h:${hue};--x:${x}%;--y:${y}%;--a:${a}deg`;
};
// The big letters on the cover: the first part of the name, at most 6 characters.
const mark = (name) => name.split(/[-_.]/)[0].slice(0, 6);

const slide = (r, i, total, inCarousel = true) => `
          <div class="slide${i === 0 || !inCarousel ? " on" : ""}" id="${slug(r.name)}"${inCarousel ? ` role="group" aria-roledescription="slide" aria-label="${i + 1} of ${total}: ${esc(r.name)}"` : ""}>
            <a class="cover" href="${esc(r.url)}" style="${coverStyle(r)}" tabindex="-1" aria-hidden="true">
              <span class="cover-mark">${esc(mark(r.name))}</span>
              <span class="cover-lang">${esc(r.language || "repo")}</span>
            </a>
            <div class="info">
              <p class="no">N&#186; ${pad(i + 1)} / ${pad(total)}</p>
              <h3><a href="${esc(r.url)}">${esc(r.name)}</a></h3>
              ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ""}
              <ul class="tags" aria-label="Details">
                ${r.language ? `<li>${esc(r.language)}</li>` : ""}
                <li><time datetime="${r.pushed.toISOString().slice(0, 10)}">${month(r.pushed)}</time></li>
              </ul>
              <p class="go"><a class="btn" href="${esc(r.url)}">View project <span aria-hidden="true">&#8599;</span></a>${r.homepage ? ` <a class="btn ghost" href="${esc(r.homepage)}">Live site</a>` : ""}</p>
            </div>
          </div>`;

const carousel = (items) => `
        <div class="carousel" role="region" aria-roledescription="carousel" aria-label="Projects">
          <div class="track" id="track" tabindex="0">${items.map((r, i) => slide(r, i, items.length)).join("")}
          </div>
          <div class="controls">
            <button type="button" class="nav" id="prev" aria-label="Previous project">&#8592;</button>
            <p class="pos" aria-live="polite"><span id="pos">01</span> / ${pad(items.length)}</p>
            <button type="button" class="nav" id="next" aria-label="Next project">&#8594;</button>
          </div>
        </div>`;

// An endless carousel needs at least 3 projects. With fewer, the page shows each project as a card.
export const MIN_CAROUSEL = 3;
const cards = (items) => `
        <div class="cards">${items.map((r, i) => slide(r, i, items.length, false)).join("")}
        </div>`;

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
    </section>
    <div class="stage" id="stage" aria-hidden="true">
      <canvas></canvas>
      <p class="say" hidden>gobble gobble!</p>
      <pre class="walker">${frameHtml(turkey(0, 1))}</pre>
    </div>

    <section class="part" id="work" aria-labelledby="t-work">
      <div class="wrap">
        <div class="part-head">
          <h2 id="t-work">What I build</h2>
          <span class="count">${recent.length} active, from GitHub</span>
        </div>
        ${
          recent.length
            ? recent.length >= MIN_CAROUSEL
              ? carousel(recent)
              : cards(recent)
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
  <script>addEventListener("load",()=>setTimeout(()=>document.body.append(Object.assign(document.createElement("script"),{src:"app.js"})),900))</script>
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
