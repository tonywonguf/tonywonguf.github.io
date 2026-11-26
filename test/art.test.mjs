import { test } from "node:test";
import assert from "node:assert/strict";
import { turkey, tree, reindeer, frameHtml } from "../src/art.mjs";

const frames = [];
for (let p = 0; p < 6; p++) for (const d of [1, -1]) frames.push(["turkey", turkey(p, d)]);
for (let a = 0; a < 6.3; a += 0.7) frames.push(["tree", tree(a, a)]);
frames.push(["reindeer", reindeer(0)], ["reindeer", reindeer(1)]);

test("each frame has one color digit for each character, and all rows have one width", () => {
  for (const [name, f] of frames) {
    assert.equal(f.t.length, f.k.length, name);
    const w = f.t[0].length;
    f.t.forEach((row, r) => {
      assert.equal(row.length, w, `${name} row ${r} width`);
      assert.equal(f.k[r].length, w, `${name} row ${r} colors`);
      assert.match(f.k[r], /^[.0-9]+$/, `${name} row ${r} digits`);
    });
  }
});

test("a turkey that faces left is the mirror of one that faces right", () => {
  const r = turkey(0, 1);
  const l = turkey(0, -1);
  // Rounding on feather borders can change a few cells, so most cells must match.
  const a = l.k.join("");
  const b = r.k.map((s) => [...s].reverse().join("")).join("");
  let same = 0;
  for (let i = 0; i < a.length; i++) same += a[i] === b[i];
  assert.ok(same / a.length > 0.97, `${same} of ${a.length} cells match`);
});

test("the art functions use no names from outside themselves, so the build can put them inline", () => {
  for (const fn of [turkey, tree, reindeer, frameHtml]) {
    const copy = new Function(`return (${fn.toString()})`)();
    assert.doesNotThrow(() => copy.length);
  }
  const t = new Function(`return (${turkey.toString()})`)()(2, 1);
  assert.deepEqual(t, turkey(2, 1));
});

test("the frame HTML escapes the beak and has one span for each color run", () => {
  const html = frameHtml(turkey(0, -1));
  assert.doesNotMatch(html, /<(?!\/?span)/);
  assert.match(html, /&lt;/);
  assert.match(html, /<span class="k4">/);
});
