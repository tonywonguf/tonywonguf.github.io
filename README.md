# Personal site

This repository makes the personal website of Tony Wong. The site is one static page with three parts: what I use AI for, what I build, and what I work on now.

## How the site gets the project list

The build script reads the list of repositories from the GitHub API. The endpoint `/users/tonywonguf/repos` gives only public repositories. The script also examines the `private` and `visibility` fields of each repository. If a repository is not public, the script does not list it and writes its name in a warning.

The script does not list forks, archived repositories, or the names in `projects.exclude` in `content/site.json`. Repositories with a push in the last 120 days go in "What I build". Older repositories go in "Earlier work".

## Build the site

You must have Node.js 20 or later. The build uses no packages.

1. Run `npm test` to do the tests of the repository filter.
2. Run `npm run build` to get the repository list from GitHub and write the site to `dist/`.
3. If you have no network connection, run `npm run build:offline`. This command uses `data/repos.json` from the last build.

## Change the text

All text is in `content/site.json`. Change the text there and build again. Do not put work for an employer, private repositories, an email address, or a phone number in this file.

## Publish

The workflow `.github/workflows/pages.yml` does the tests, builds the site, and publishes `dist/` to GitHub Pages. It operates on each push to `main` and one time each day. The daily build adds new public repositories to the site.
