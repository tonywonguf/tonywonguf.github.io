import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRepos } from "../src/repos.mjs";

const now = new Date("2026-11-22T00:00:00Z");
const base = {
  fork: false,
  archived: false,
  html_url: "https://github.com/x/y",
  description: "d",
  language: "Rust",
};

test("lists a public repo", () => {
  const out = selectRepos(
    [
      {
        ...base,
        name: "a",
        private: false,
        visibility: "public",
        pushed_at: "2026-11-20T00:00:00Z",
      },
    ],
    {},
    now,
  );
  assert.deepEqual(
    out.recent.map((r) => r.name),
    ["a"],
  );
});

test("refuses a private repo", () => {
  const out = selectRepos(
    [
      {
        ...base,
        name: "secret",
        private: true,
        visibility: "private",
        pushed_at: "2026-11-20T00:00:00Z",
      },
    ],
    {},
    now,
  );
  assert.equal(out.recent.length + out.earlier.length, 0);
  assert.deepEqual(out.refused, ["secret"]);
});

test("refuses an internal repo and a repo with no visibility field", () => {
  const out = selectRepos(
    [
      {
        ...base,
        name: "inner",
        private: false,
        visibility: "internal",
        pushed_at: "2026-11-20T00:00:00Z",
      },
      {
        ...base,
        name: "unknown",
        private: false,
        pushed_at: "2026-11-20T00:00:00Z",
      },
    ],
    {},
    now,
  );
  assert.equal(out.recent.length + out.earlier.length, 0);
  assert.deepEqual(out.refused, ["inner", "unknown"]);
});

test("skips forks, archived and excluded repos", () => {
  const pub = {
    ...base,
    private: false,
    visibility: "public",
    pushed_at: "2026-11-20T00:00:00Z",
  };
  const out = selectRepos(
    [
      { ...pub, name: "f", fork: true },
      { ...pub, name: "z", archived: true },
      { ...pub, name: "x" },
      { ...pub, name: "keep" },
    ],
    { exclude: ["x"] },
    now,
  );
  assert.deepEqual(
    out.recent.map((r) => r.name),
    ["keep"],
  );
});

test("splits recent and earlier work, and uses a blurb when one is set", () => {
  const pub = { ...base, private: false, visibility: "public" };
  const out = selectRepos(
    [
      {
        ...pub,
        name: "old",
        pushed_at: "2023-01-01T00:00:00Z",
        description: null,
      },
      { ...pub, name: "new", pushed_at: "2026-11-01T00:00:00Z" },
    ],
    { recentDays: 120, blurbs: { old: "Old game." } },
    now,
  );
  assert.deepEqual(
    out.recent.map((r) => r.name),
    ["new"],
  );
  assert.deepEqual(
    out.earlier.map((r) => r.description),
    ["Old game."],
  );
});
