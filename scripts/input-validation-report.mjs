#!/usr/bin/env node
// Static input-validation evidence for both:
// 1. The public HTTP surface (`src/routes/api/public/**`)
// 2. The internal server RPC functions (`src/lib/*.functions.ts`)
//
// Usage:
//   node scripts/input-validation-report.mjs            # print the matrices
//   node scripts/input-validation-report.mjs --json     # machine-readable JSON
//   node scripts/input-validation-report.mjs --check    # exit 1 on any gap
//   node scripts/input-validation-report.mjs --write-doc # update docs/INPUT_VALIDATION.md
//
// CI runs it with `--check`, so any unvalidated public route or internal RPC function
// fails the build immediately.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_API = "src/routes/api/public";
const LIB_DIR = "src/lib";

/** Patterns that read caller-controlled data out of HTTP requests. */
const INPUT_READS = [
  ["json body", /request\s*\.\s*json\s*\(/],
  ["raw body", /request\s*\.\s*text\s*\(/],
  ["multipart", /request\s*\.\s*formData\s*\(/],
  ["body reader", /readJsonBody\s*\(/],
  ["query string", /searchParams|queryRecord\s*\(/],
  ["path param", /\bparams\s*\./],
];

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

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function analyseHttpRoute(file) {
  const source = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
  const inputs = INPUT_READS.filter(([, re]) => re.test(source)).map(([label]) => label);
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
    status: inputs.length === 0 ? "no-input" : schemas.length > 0 ? "validated" : "GAP",
  };
}

export function analyseRpcFunctions() {
  const files = readdirSync(path.join(ROOT, LIB_DIR))
    .filter((f) => f.endsWith(".functions.ts"))
    .map((f) => path.join(LIB_DIR, f).split(path.sep).join("/"));

  const results = [];

  for (const file of files) {
    const raw = readFileSync(path.join(ROOT, file), "utf8");
    const source = stripComments(raw);
    const matches = [...source.matchAll(/export\s+const\s+(\w+)\s*=\s*createServerFn\(/g)];

    for (const m of matches) {
      const fnName = m[1];
      const fnStart = m.index;
      const nextFnMatch = source.indexOf("export const ", fnStart + 10);
      const chunk = source.slice(fnStart, nextFnMatch === -1 ? undefined : nextFnMatch);

      const hasValidatorCall = /\.(inputValidator|validator)\(/.test(chunk);
      const validatorMatch = chunk.match(/\.(?:inputValidator|validator)\s*\(\s*([^)]+)\)/);
      const validatorExpr = validatorMatch ? validatorMatch[1].trim() : null;

      const schemas = [...new Set([...chunk.matchAll(SAFE_PARSE)].map((s) => s[1] ?? s[2]))]
        .filter((name) => name !== "JSON")
        .sort();

      const isValidated = hasValidatorCall || schemas.length > 0;
      results.push({
        file,
        fnName,
        hasValidatorCall,
        validatorExpr,
        schemas,
        status: isValidated ? "validated" : "GAP",
      });
    }
  }

  return results;
}

const httpFiles = walk(PUBLIC_API);
const httpRows = httpFiles.map(analyseHttpRoute);
const httpGaps = httpRows.filter((r) => r.status === "GAP");
const httpValidated = httpRows.filter((r) => r.status === "validated");
const httpInert = httpRows.filter((r) => r.status === "no-input");

const rpcRows = analyseRpcFunctions();
const rpcGaps = rpcRows.filter((r) => r.status === "GAP");
const rpcValidated = rpcRows.filter((r) => r.status === "validated");

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        http: {
          total: httpRows.length,
          validated: httpValidated.length,
          noInput: httpInert.length,
          gaps: httpGaps,
          rows: httpRows,
        },
        rpc: {
          total: rpcRows.length,
          validated: rpcValidated.length,
          gaps: rpcGaps,
          rows: rpcRows,
        },
      },
      null,
      2,
    ),
  );
} else {
  const httpWidth = Math.max(...httpRows.map((r) => r.endpoint.length));
  console.log("=== Public HTTP Endpoint Input-Validation Matrix ===\n");
  for (const r of httpRows.slice().sort((a, b) => a.endpoint.localeCompare(b.endpoint))) {
    const mark = r.status === "GAP" ? "FAIL" : r.status === "no-input" ? "  --" : "  ok";
    const detail =
      r.status === "no-input"
        ? "no caller input"
        : `${r.schemas.join(", ") || "(none)"}  <- ${r.reads.join(", ")}`;
    console.log(`${mark}  ${r.endpoint.padEnd(httpWidth)}  ${detail}`);
  }
  console.log(
    `\n${httpValidated.length} endpoints validated with a schema, ` +
      `${httpInert.length} read no caller input, ${httpGaps.length} unguarded.\n`,
  );

  console.log("=== Internal Server RPC Input-Validation Matrix (src/lib/*.functions.ts) ===\n");
  const rpcWidth = Math.max(...rpcRows.map((r) => `${r.file}:${r.fnName}`.length));
  for (const r of rpcRows.slice().sort((a, b) => a.file.localeCompare(b.file) || a.fnName.localeCompare(b.fnName))) {
    const mark = r.status === "GAP" ? "FAIL" : "  ok";
    const target = `${r.file}:${r.fnName}`.padEnd(rpcWidth);
    const detail = r.validatorExpr ? `validator: ${r.validatorExpr.slice(0, 45)}` : r.schemas.join(", ");
    console.log(`${mark}  ${target}  ${detail}`);
  }
  console.log(
    `\n${rpcValidated.length} RPC functions validated with a schema, ${rpcGaps.length} unguarded.\n`,
  );
}

// Generate / update docs/INPUT_VALIDATION.md if requested
if (process.argv.includes("--write-doc") || process.env.UPDATE_INPUT_VALIDATION_DOC) {
  const docLines = [
    "# API & RPC Input Validation Report",
    "",
    "This document is automatically generated by `scripts/input-validation-report.mjs`.",
    "",
    "## 1. Public HTTP Endpoints (`src/routes/api/public/**`)",
    "",
    "| Route File | Status | Schemas / Validation |",
    "| :--- | :--- | :--- |",
  ];

  for (const r of httpRows.slice().sort((a, b) => a.file.localeCompare(b.file))) {
    const statusText = r.status === "validated" ? "Validated" : r.status === "no-input" ? "No Input (Inert)" : "**GAP**";
    const schemaText = r.schemas.length > 0 ? r.schemas.map((s) => `\`${s}\``).join(", ") : r.status === "no-input" ? "*N/A*" : "*Missing schema*";
    docLines.push(`| \`${r.file}\` | ${statusText} | ${schemaText} |`);
  }

  docLines.push(
    "",
    "## 2. Internal Server RPC Functions (`src/lib/*.functions.ts`)",
    "",
    "| Function Location | RPC Name | Status | Validation Strategy |",
    "| :--- | :--- | :--- | :--- |",
  );

  for (const r of rpcRows.slice().sort((a, b) => a.file.localeCompare(b.file) || a.fnName.localeCompare(b.fnName))) {
    const statusText = r.status === "validated" ? "Validated" : "**GAP**";
    const strat = r.hasValidatorCall ? "`.inputValidator()` / `.validator()`" : r.schemas.map((s) => `\`${s}\``).join(", ");
    docLines.push(`| \`${r.file}\` | \`${r.fnName}\` | ${statusText} | ${strat} |`);
  }

  docLines.push("");
  writeFileSync(path.join(ROOT, "docs/INPUT_VALIDATION.md"), docLines.join("\n"), "utf8");
  console.log("Updated docs/INPUT_VALIDATION.md successfully.");
}

const totalGaps = httpGaps.length + rpcGaps.length;
if (process.argv.includes("--check") && totalGaps > 0) {
  if (httpGaps.length > 0) {
    console.error(
      `\nUnguarded public endpoints:\n${httpGaps.map((g) => `  ${g.file} (reads ${g.reads.join(", ")})`).join("\n")}`,
    );
  }
  if (rpcGaps.length > 0) {
    console.error(
      `\nUnguarded RPC functions:\n${rpcGaps.map((g) => `  ${g.file}:${g.fnName}`).join("\n")}`,
    );
  }
  process.exit(1);
}
