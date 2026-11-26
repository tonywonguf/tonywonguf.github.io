# Speed gate and screenshots

The tools in this folder measure the site. The site does not use them, and the workflow does not install them.

## Tools

| File | Function |
|---|---|
| `gate.mjs` | Serves `dist/` with gzip and runs Lighthouse on a simulated phone. It gives the median of each value and exits with 1 if a value is outside the budget. |
| `shots.mjs` | Makes screenshots at phone, tablet and desktop width, in the light and the dark color scheme. |
| `carouselcheck.mjs` | Makes sure that the arrow buttons and the arrow keys move the project carousel, and that the counter follows. |
| `remote.sh` | Copies `dist/` and `perf/` to the laptop (ssh host `gpu-node`) and runs one tool there. |

## Requirements

The tools need Node.js, a Chromium binary in `CHROME_PATH`, and the packages `lighthouse` and `puppeteer-core`. On the laptop, these are in `~/site-rewrite`. The file `~/site-rewrite/env.sh` sets the paths.

## Measure the budget

1. Build the site with `npm run build:offline`.
2. Run `perf/remote.sh gate 5` to do five Lighthouse runs on the laptop.
3. Run `perf/remote.sh shots` to make the screenshots. They go to `~/.cache/site-rewrite/ours`.
4. Run `perf/remote.sh carouselcheck.mjs` to do a test of the carousel.

## Cut the fonts again

If the page needs a character that is not in the fonts, cut the fonts again from the full Schibsted Grotesk files. Use `fonttools` on the laptop:

1. Make a static instance of each weight: `fonttools varLib.instancer FULL.woff2 wght=400 -o s400.ttf`. Do the same for 700, and for 400 of the italic file.
2. Cut each instance to the characters of the page: `pyftsubset s400.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2192,U+2197,U+00B7" --layout-features="kern,liga,calt,tnum" --flavor=woff2 --output-file=schibsted-grotesk-400.woff2`.

Use static instances, not a variable font. The Chromium on the laptop refuses the variable font, and each static file is approximately 19 KB.
