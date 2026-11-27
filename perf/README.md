# Speed gate and screenshots

The tools in this folder measure the site. The site does not use them, and the workflow does not install them.

## Tools

| File | Function |
|---|---|
| `gate.mjs` | Serves `dist/` with gzip (or measures a URL) and runs Lighthouse on a simulated phone. It also prints the element of the largest paint. It gives the median of each value and exits with 1 if a value is outside the budget. |
| `shots.mjs` | Makes screenshots at phone, tablet and desktop width, in the light and the dark color scheme. |
| `carouselcheck.mjs` | Makes sure that the project carousel loops and has no progress bar. It also makes sure that the buttons, the arrow keys, a mouse drag, a fast flick, a touch swipe and a horizontal wheel move it, and that reduced motion stops the glide. |
| `effectcheck.mjs` | Makes sure that the dither effects start (covers, glow, glyph canvas), that a click throws the glyphs and they come home, that reduced motion keeps the stage still, and that the winter art turns. It saves screenshots. |
| `koicheck.mjs` | Makes sure that the page gets no koi file before the pond comes near the screen, that the koi draws and moves when the pond is on the screen, that the pond starts only one time, that reduced motion shows the still koi, and that the page writes no console errors. It saves screenshots. |
| `remote.sh` | Copies `dist/` and `perf/` to the laptop (ssh host `gpu-node`) and runs one tool there. |

## Requirements

The tools need Node.js, a Chromium binary in `CHROME_PATH`, and the packages `lighthouse` and `puppeteer-core`. On the laptop, these are in `~/site-rewrite`. The file `~/site-rewrite/env.sh` sets the paths.

## Measure the budget

1. Build the site with `npm run build:offline`.
2. Run `perf/remote.sh gate 5` to do five Lighthouse runs on the laptop.
3. Run `perf/remote.sh shots` to make the screenshots. They go to `~/.cache/site-rewrite/ours`.
4. Run `perf/remote.sh carouselcheck.mjs` to do a test of the carousel.
5. Run `OUT=DIR perf/remote.sh effectcheck.mjs` to do a test of the effects. The screenshots go to DIR.
6. Run `OUT=DIR perf/remote.sh koicheck.mjs` to do a test of the koi pond. The screenshots go to DIR.
7. After a publish, run `perf/remote.sh gate-url https://tonywonguf.github.io/ 5` to measure the live site. The live result includes the real network time to GitHub Pages.

## Cut the fonts again

If the page needs a character that is not in the fonts, cut the fonts again from the full Schibsted Grotesk files. Use `fonttools` on the laptop:

1. Make a static instance of each weight: `fonttools varLib.instancer FULL.woff2 wght=400 -o s400.ttf`. Do the same for 700, and for 400 of the italic file.
2. Cut each instance to the characters of the page: `pyftsubset s400.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2192,U+2197,U+00B7" --layout-features="kern,liga,calt,tnum" --flavor=woff2 --output-file=schibsted-grotesk-400.woff2`.

Use static instances, not a variable font. The Chromium on the laptop refuses the variable font, and each static file is approximately 19 KB.
