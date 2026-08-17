#!/usr/bin/env node
// Fails when a `process.env["X"]` read in shipped source has no entry in
// .env.example. Undocumented config is the single most common reason a fresh
// clone boots into a half-broken state, so the gate lives in CI.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["src", "packages", "workers", "deploy"];
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".output", "coverage", "build"]);

/** Names that exist only as runtime platform injections, never in a .env file. */
const PLATFORM_PROVIDED = new Set(["NODE_ENV", "CI"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(extname(name)) && !name.includes(".test.")) out.push(full);
  }
  return out;
}

const used = new Set();
const pattern = /process\.env(?:\[\s*["'`]([A-Z0-9_]+)["'`]\s*\]|\.([A-Z0-9_]+))/g;
for (const file of ROOTS.flatMap((r) => walk(r))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(pattern)) {
    const name = m[1] ?? m[2];
    if (!PLATFORM_PROVIDED.has(name)) used.add(name);
  }
}

function documentedIn(file) {
  return new Set(
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
      .filter(Boolean),
  );
}

function report(missing, file) {
  if (missing.length === 0) return false;
  console.error(`Missing from ${file}:\n` + missing.map((n) => `  ${n}=`).join("\n"));
  return true;
}

const documented = documentedIn(".env.example");
let failed = report(
  [...used].filter((name) => !documented.has(name)).sort(),
  ".env.example",
);

// The Expo app has its own template and its own inlining rule: only
// `EXPO_PUBLIC_*` reaches the bundle, so only those are worth documenting.
const mobileUsed = new Set();
const mobilePattern = /process\.env(?:\[\s*["'`](EXPO_PUBLIC_[A-Z0-9_]+)["'`]\s*\]|\.(EXPO_PUBLIC_[A-Z0-9_]+))/g;
for (const file of walk("mobile")) {
  for (const m of readFileSync(file, "utf8").matchAll(mobilePattern)) {
    mobileUsed.add(m[1] ?? m[2]);
  }
}
const mobileDocumented = documentedIn("mobile/.env.example");
failed =
  report(
    [...mobileUsed].filter((name) => !mobileDocumented.has(name)).sort(),
    "mobile/.env.example",
  ) || failed;

if (failed) process.exit(1);
console.log(
  `env parity OK — ${used.size} web variables and ${mobileUsed.size} mobile variables, all documented.`,
);

