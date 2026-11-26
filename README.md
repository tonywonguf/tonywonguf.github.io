# Personal site

This repository makes the personal website of Tony Wong. The site is one static page. It has four parts: the first screen, what I build, what I work on now, and how I use AI. The build also writes `llms.txt`, a plain text copy of the page for AI assistants.

## How the site gets the project list

The build script reads the list of repositories from the GitHub API. The endpoint `/users/tonywonguf/repos` gives only public repositories. The script also examines the `private` and `visibility` fields of each repository. If a repository is not public, the script does not list it and writes its name in a warning.

The script does not list forks, archived repositories, or the names in `projects.exclude` in `content/site.json`. Repositories with a push in the last 120 days go in "What I build". Older repositories go in "Earlier work".

## Files

| File | Content |
|---|---|
| `content/site.json` | All text of the page |
| `src/build.mjs` | Gets the repositories and writes `dist/` |
| `src/repos.mjs` | The filter for public repositories |
| `src/render.mjs` | Makes the HTML page and `llms.txt` |
| `src/style.css` | The styles. The build puts them inline in the page. |
| `src/agent-art.mjs`, `src/agent.js` | The ASCII agent on the first screen. Its eyes follow the pointer. |
| `assets/fonts/` | Schibsted Grotesk, cut to Latin characters (SIL Open Font License) |
| `perf/` | The speed gate and the screenshot tools. The site does not use them. |

## Build the site

You must have Node.js 20 or later. The build uses no packages.

1. Run `npm test` to do the tests of the repository filter and of the page.
2. Run `npm run build` to get the repository list from GitHub and write the site to `dist/`.
3. If you have no network connection, run `npm run build:offline`. This command uses `data/repos.json` from the last build.
4. To see the page on your computer, run `npm run preview` and open http://localhost:8000.

## Change the text

All text is in `content/site.json`. Change the text there and build again. In `headline`, put a word between two asterisks to show it in italic, for example `*local AI*`. Do not put work for an employer, private repositories, an email address, or a phone number in this file.

## Speed budget

Each change must stay in this budget on a simulated phone (Lighthouse, mobile):

- Performance, Accessibility, Best Practices and SEO: 98 or more each.
- Largest Contentful Paint: less than 1.2 s.
- Cumulative Layout Shift: less than 0.02.
- Total Blocking Time: 0 ms.
- First load: less than 100 KB.

`perf/README.md` tells how to measure the budget.

These rules keep the page in the budget:

- The page has one HTML file with the styles inline. It loads no script file and no stylesheet file.
- The fonts use `font-display: optional`. If a font is late, the browser keeps the system font and the text does not move.
- The script of the agent starts after the page loads, when the browser is idle. If the reader asks for reduced motion, the agent does not move.

## Publish

The workflow `.github/workflows/pages.yml` does the tests, builds the site, and publishes `dist/` to GitHub Pages. It operates on each push to `main` and one time each day. The daily build adds new public repositories to the site.
