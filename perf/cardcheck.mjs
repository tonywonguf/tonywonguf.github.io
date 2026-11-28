// Make sure that a copy of the site (for example the Playground card folder) has every file
// that the page asks for: each local src and href, and each file that the page script loads.
// Usage: node perf/cardcheck.mjs DIR
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const page = readFileSync(join(dir, "index.html"), "utf8");
const wanted = new Set();
for (const m of page.matchAll(/(?:src|href)="([^"#?]+)/g)) wanted.add(m[1]);
// The page adds app.js from a script, so no src attribute names it.
for (const m of page.matchAll(/src:"([^"]+)"/g)) wanted.add(m[1]);
const local = [...wanted].filter(
  (u) => !/^(https?:|mailto:|data:|\/\/)/.test(u),
);
const missing = local.filter(
  (u) => !existsSync(join(dir, u.replace(/^\.?\//, ""))),
);
const ok = missing.length === 0 && local.includes("app.js");
console.log(
  `${ok ? "PASS" : "FAIL"} card ${dir}: ${local.length} local files, missing ${missing.length}${missing.length ? ": " + missing.join(", ") : ""}`,
);
process.exit(ok ? 0 : 1);
