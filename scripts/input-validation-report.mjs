#!/usr/bin/env node
// Static input-validation evidence for the public HTTP surface.
//
// Every file under `src/routes/api/public/**` is reachable without app auth,
// so each one owns its own trust boundary. This script walks that surface and
// proves, per route, that caller-supplied input (JSON body, query string, path
// param, multipart form) is run through a literal Zod `.safeParse(...)` /
// `.parse(...)` call *inside the route file itself* — not hidden behind a
// helper where neither a reviewer nor a static scanner can see it.
//
// Usage:
//   node scripts/input-validation-report.mjs            # print the matrix
//   node scripts/input-validation-report.mjs --json     # machine-readable
//   node scripts/input-validation-report.mjs --check    # exit 1 on any gap
//
// CI runs it with `--check`, so a new public endpoint that reads untrusted
// input without a visible schema fails the build.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_API = "src/routes/api/public";

/** Patterns that read caller-controlled data out of the request. */
const INPUT_READS = [
  ["json body", /request\s*\.\s*json\s*\(/],
  ["raw body", /request\s*\.\s*text\s*\(/],
  ["multipart", /request\s*\.\s*formData\s*\(/],
  ["body reader", /readJsonBody\s*\(/],
  ["query string", /searchParams|queryRecord\s*\(/],
  ["path param", /\bparams\s*\./],
];

/**
 * A literal schema call written in the route file. `safeParse` is accepted on
 * any identifier (route-local schemas are often lower-cased); bare `.parse(`
 * only on a capitalised one, so a decoder like `parser.parse(xml)` is not
 * mistaken for a validator.
 */
const SAFE_PARSE = /\b([A-Za-z_$][\w$]*)\s*\.\s*safeParse\s*\(|\b([A-Z][\w$]*)\s*\.\s*parse\s*\(/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(rel.split(path.sep).join("/"));
    }
  }
  return out;
}

/** Strip comments so a pattern mentioned in prose is not counted as code. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function analyse(file) {
  const source = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
  const inputs = INPUT_READS.filter(([, re]) => re.test(source)).map(([label]) => label);
  // `JSON.parse` is a decoder, not a schema — it proves nothing about shape.
  const schemas = [...new Set([...source.matchAll(SAFE_PARSE)].map((m) => m[1] ?? m[2]))]
    .filter((name) => name !== "JSON")
    .sort();
  const endpoint =
    "/" +
    file
      .replace(/^src\/routes\//, "")
      .replace(/\.tsx?$/, "")
      .replace(/\/index$/, "")
      .replace(/\$/g, ":");
  return {
    file,
    endpoint,
    reads: inputs,
    schemas,
    // A route that reads nothing from the caller has no boundary to guard.
    status: inputs.length === 0 ? "no-input" : schemas.length > 0 ? "validated" : "GAP",
  };
}

const files = walk(PUBLIC_API);
const rows = files.map(analyse);
const gaps = rows.filter((r) => r.status === "GAP");
const validated = rows.filter((r) => r.status === "validated");
const inert = rows.filter((r) => r.status === "no-input");

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      { total: rows.length, validated: validated.length, noInput: inert.length, gaps, rows },
      null,
      2,
    ),
  );
} else {
  const width = Math.max(...rows.map((r) => r.endpoint.length));
  console.log("Public endpoint input-validation matrix\n");
  for (const r of rows.slice().sort((a, b) => a.endpoint.localeCompare(b.endpoint))) {
    const mark = r.status === "GAP" ? "FAIL" : r.status === "no-input" ? "  --" : "  ok";
    const detail =
      r.status === "no-input"
        ? "no caller input"
        : `${r.schemas.join(", ") || "(none)"}  <- ${r.reads.join(", ")}`;
    console.log(`${mark}  ${r.endpoint.padEnd(width)}  ${detail}`);
  }
  console.log(
    `\n${validated.length} endpoints validated with a schema, ` +
      `${inert.length} read no caller input, ${gaps.length} unguarded.`,
  );
}

if (process.argv.includes("--check") && gaps.length > 0) {
  console.error(
    `\nUnguarded public endpoints:\n${gaps.map((g) => `  ${g.file} (reads ${g.reads.join(", ")})`).join("\n")}`,
  );
  process.exit(1);
}
