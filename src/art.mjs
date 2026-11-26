// Colored ASCII art for the stage under the first screen.
// The build puts the source of these functions inline in the page, so each function must not use names from outside itself.
// A frame is { t: [rows of characters], k: [rows of color digits] }. Digit "." is no color.
// The color digits map to the CSS classes k0 to k9 (see style.css).

// The turkey. pose: 0 to 3 are walk steps, 4 and 5 are peck steps. dir: 1 faces right, -1 faces left.
export function turkey(pose, dir) {
  const W = 46;
  const H = 22;
  const walk = pose < 4;
  const peck = pose === 5 ? 1 : pose === 4 ? 0.5 : 0;
  const step = walk ? [0, 1, 0, -1][pose] : 0;
  // Shapes in square units: x from 0 to W, y from 0 to 2H (a cell is twice as tall as it is wide).
  // Each shape: f(x, y) gives [character, color] or null. Later shapes are on top.
  const ell = (cx, cy, rx, ry, paint) => (x, y) => {
    const u = (x - cx) / rx;
    const v = (y - cy) / ry;
    const d = u * u + v * v;
    return d <= 1 ? paint(u, v, d, x, y) : null;
  };
  const seg = (x1, y1, x2, y2, w, ch, k) => (x, y) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(
      0,
      Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)),
    );
    const ex = x1 + t * dx - x;
    const ey = y1 + t * dy - y;
    return ex * ex + ey * ey <= w * w
      ? [typeof ch === "function" ? ch(dx, dy) : ch, k]
      : null;
  };
  const slant = (dx, dy) =>
    Math.abs(dx) < Math.abs(dy) * 0.4 ? "|" : dx * dy > 0 ? "\\" : "/";
  // The tail fan: feathers that spread from a point behind the body.
  const tcx = 15;
  const tcy = 25;
  const tail = (x, y) => {
    const dx = x - tcx;
    const dy = y - tcy;
    const r = Math.hypot(dx, dy) / 21;
    const a = Math.atan2(dy, dx);
    if (r > 1 || a > -0.05 || a < -Math.PI + 0.05) return null;
    const f = ((-a - 0.05) / (Math.PI - 0.1)) * 9;
    const i = Math.floor(f);
    const e = f - i;
    // Round feather ends.
    if (r > 0.9 - 0.12 * Math.abs(e - 0.5) * 2 + 0.06) return null;
    const ch =
      Math.abs(dx) < Math.abs(dy) * 0.35 ? "|" : dx * dy > 0 ? "\\" : "/";
    if (e < 0.1 || e > 0.92) return [ch, "0"];
    if (r > 0.8) return ["o", "5"];
    if (r > 0.72) return ["=", i % 2 ? "0" : "3"];
    if (r > 0.6) return [ch, i % 2 ? "2" : "3"];
    return [ch, i % 2 ? "1" : "2"];
  };
  const body = ell(19, 29.5, 12, 9, (u, v, d, x, y) => {
    const l = 0.55 - 0.35 * u - 0.45 * v - 0.25 * d;
    const row = Math.floor(y / 2);
    const scale = (Math.floor(x) + row) % 2 ? "v" : "w";
    if (d > 0.82)
      return [
        Math.abs(v) > Math.abs(u) * 1.3
          ? v < 0
            ? "~"
            : "_"
          : u < 0
            ? "("
            : ")",
        "0",
      ];
    // Rows of small feathers. The light comes from the top left.
    return [l > 0.78 ? "o" : scale, l > 0.62 ? "2" : l > 0.36 ? "1" : "0"];
  });
  const wing = ell(18, 29, 7.5, 5, (u, v, d) =>
    d > 0.7
      ? [v < 0 ? "~" : "_", "0"]
      : [v < 0.2 ? ")" : "/", v < -0.3 ? "2" : "0"],
  );
  // Neck and head. The head goes down and forward to peck.
  const hx = 32 + 5 * peck;
  const hy = 14 + 21 * peck;
  const neck = seg(27, 26, hx - 0.5, hy + 2, 2.3, slant, "6");
  const head = ell(hx, hy, 3.2, 3.6, (u) => [
    u > 0.2 ? ")" : u < -0.5 ? "(" : "o",
    "6",
  ]);
  const eye = ell(hx + 0.9, hy - 0.8, 0.7, 0.8, () => ["@", "8"]);
  const beak = seg(hx + 2.4, hy, hx + 4.6, hy + 0.6 + 2 * peck, 0.9, ">", "7");
  const snood = seg(hx + 2.2, hy - 1.6, hx + 3.6, hy + 3.5, 0.75, "S", "4");
  const wattle = ell(hx + 0.9, hy + 4.2, 1.4, 2.6, (u, v) => [
    v > 0.3 ? "U" : "u",
    "4",
  ]);
  // Legs. Each walk step moves the feet.
  const fy = 43;
  const lx = 16 + 3 * step;
  const rx = 22 - 3 * step;
  const leg = (x0, x1) => seg(x0, 37, x1, fy - 1, 0.95, slant, "7");
  const foot = (x1) => (x, y) =>
    y > fy - 1.4 && y <= fy && Math.abs(x - x1) < 2.4
      ? [x < x1 - 0.7 ? "_" : x > x1 + 0.7 ? "_" : "^", "7"]
      : null;
  const shapes = [
    tail,
    leg(17, lx),
    leg(21, rx),
    foot(lx),
    foot(rx),
    body,
    wing,
    neck,
    head,
    eye,
    wattle,
    snood,
    beak,
  ];
  const t = [];
  const k = [];
  for (let r = 0; r < H; r++) {
    let tr = "";
    let kr = "";
    for (let c = 0; c < W; c++) {
      const x0 = dir > 0 ? c + 0.5 : W - c - 0.5;
      const y0 = r * 2 + 1;
      let hit = null;
      for (const s of shapes) hit = s(x0, y0) || hit;
      if (!hit) {
        // Soft edge: if the cell center is empty, look at the four corners of the cell.
        let m = 0;
        let edge = null;
        [
          [-0.3, -0.6],
          [0.3, -0.6],
          [-0.3, 0.6],
          [0.3, 0.6],
        ].forEach(([ox, oy], i) => {
          let h = null;
          for (const s of shapes)
            h = s(x0 + (dir > 0 ? ox : -ox), y0 + oy) || h;
          if (h) {
            m |= 1 << i;
            edge = h;
          }
        });
        // Bits: 1 top left, 2 top right, 4 bottom left, 8 bottom right.
        if (m) hit = [" '''.)//.\\(\\.\\/o".charAt(m), edge[1]];
      }
      let ch = hit ? hit[0] : " ";
      if (dir < 0)
        ch = { "/": "\\", "\\": "/", "(": ")", ")": "(", ">": "<" }[ch] || ch;
      tr += ch;
      kr += hit && ch !== " " ? hit[1] : ".";
    }
    t.push(tr);
    k.push(kr);
  }
  return { t, k };
}

// The spinning tree. a is the angle in radians, s is a time value that makes the lights blink.
export function tree(a, s) {
  const W = 45;
  const H = 23;
  const cx = W / 2;
  const t = [];
  const k = [];
  // Three tiers: [top row, bottom row, radius at the bottom in columns].
  const tiers = [
    [3, 9, 7.5],
    [7, 15, 13.5],
    [12, 20, 19.5],
  ];
  for (let r = 0; r < H; r++) {
    let tr = "";
    let kr = "";
    for (let c = 0; c < W; c++) {
      const x = c + 0.5 - cx;
      let ch = " ";
      let col = ".";
      if (r === 1 && Math.abs(x) < 0.6) [ch, col] = ["*", "3"];
      else if (r === 2 && Math.abs(x) < 1.6)
        [ch, col] = [
          x < -0.5 ? "-" : x > 0.5 ? "-" : (s * 3) % 2 < 1 ? "A" : "V",
          "3",
        ];
      else if (r >= 21 && Math.abs(x) < 1.6) [ch, col] = ["#", "0"];
      for (const [top, bot, rad] of tiers) {
        if (ch !== " " || r < top || r > bot) continue;
        const R = ((r - top + 0.5) / (bot - top + 1)) * rad;
        if (Math.abs(x) > R) continue;
        // The point on the front of the cone, turned by the angle a.
        const z = Math.sqrt(Math.max(0, R * R - x * x));
        const phi = Math.atan2(x, z) + a;
        const light = 0.5 - 0.5 * (x / R) * 0.8 + 0.2 * (z / R);
        const u = (phi / (2 * Math.PI)) * 7;
        const g = (u + r * 0.32) % 1;
        if (r === bot) [ch, col] = [c % 2 ? "/" : "\\", c % 4 < 2 ? "9" : "1"];
        else if (Math.abs(x) > R - 0.9) [ch, col] = [x < 0 ? "/" : "\\", "9"];
        else if ((g + 1) % 1 < 0.07) [ch, col] = ["~", "3"];
        else {
          const cellU = Math.floor(u * 1.5);
          const near =
            Math.abs(u * 1.5 - cellU - 0.5) < 0.18 && (r + cellU) % 3 === 0;
          if (near) {
            const n = (((cellU % 4) + 4) % 4) * 1 + r;
            const on = Math.sin(s * 4 + n * 1.7) > -0.3;
            [ch, col] = [on ? "o" : ".", ["4", "6", "3", "5"][n % 4]];
          } else
            [ch, col] = [
              " .:-=+*#".charAt(
                Math.max(1, Math.min(7, Math.floor(light * 8))),
              ),
              light > 0.55 ? "9" : "1",
            ];
        }
      }
      tr += ch;
      kr += ch === " " ? "." : col;
    }
    t.push(tr);
    k.push(kr);
  }
  return { t, k };
}

// The reindeer that stands near the tree. pose 0 or 1 moves the head; the nose blinks with pose.
export function reindeer(pose) {
  const rows = [
    "  \\|/ \\|/        ",
    "   \\\\_//         ",
    "    (oo)___      ",
    "   (_ @    \\     ",
    "      \\_    )~~~,",
    "        )==(    )",
    "       /  ||   ||",
    "      ^^  ^^   ^^",
  ];
  const cols = [
    "  000 000        ",
    "   00000         ",
    "    68811        ",
    "   11 4    1     ",
    "      11    1555 ",
    "        1441    1",
    "       1  11   11",
    "      00  00   00",
  ];
  const t = rows.map((s, i) => (pose && i < 4 ? " " + s.slice(0, -1) : s));
  const k = cols.map((s, i) =>
    (pose && i < 4 ? "." + s.slice(0, -1) : s).replace(/ /g, "."),
  );
  if (pose) k[3] = k[3].replace("4", "3");
  return { t, k };
}

// Make the HTML of a frame: one span for each run of one color.
export function frameHtml(f) {
  const esc = { "<": "&lt;", ">": "&gt;", "&": "&amp;" };
  return f.t
    .map((line, r) => {
      let out = "";
      let i = 0;
      while (i < line.length) {
        const k = f.k[r][i];
        let j = i;
        while (j < line.length && f.k[r][j] === k) j++;
        const s = line.slice(i, j).replace(/[<>&]/g, (c) => esc[c]);
        out += k === "." ? s : '<span class="k' + k + '">' + s + "</span>";
        i = j;
      }
      return out.replace(/\s+$/, "");
    })
    .join("\n");
}
