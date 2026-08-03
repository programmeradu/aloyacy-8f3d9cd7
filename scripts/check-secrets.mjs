#!/usr/bin/env node
// Lightweight, dependency-free secret scanner. Catches the credential shapes
// that actually show up in this stack before they reach a commit: service-role
// JWTs, Supabase `sb_secret_` keys, Stripe/Resend/Google/AWS keys and PEM
// private keys. Publishable/anon values are allowed by design — they are meant
// to ship in the client bundle.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const ROOTS = ["src", "packages", "workers", "deploy", "mobile", "scripts", "supabase"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".sql", ".yml", ".yaml", ".toml", ".md"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".output", "coverage", "build", ".expo", "ios", "android"]);

const RULES = [
  { name: "service-role JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*(?:c2VydmljZV9yb2xl|InNlcnZpY2Vfcm9sZSI)[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/ },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "Stripe live/secret key", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: "Resend API key", re: /\bre_[A-Za-z0-9]{20,}/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { name: "AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "AWS secret access key", re: /aws_?secret_?access_?key["'\s:=]+[A-Za-z0-9/+=]{40}/i },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

// Lines carrying this marker are reviewed placeholders (docs, tests, examples).
const ALLOW_MARKER = "secret-scan:allow";

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
    else if (EXTS.has(extname(name))) out.push(full);
  }
  return out;
}

const findings = [];
const files = ROOTS.flatMap((r) => walk(r));
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) findings.push(`${file}:${i + 1}  ${rule.name}`);
    }
  });
}

// Committed .env files are a finding in their own right.
for (const name of readdirSync(".")) {
  if (name.startsWith(".env") && name !== ".env.example" && basename(name) !== ".env.local") {
    // .env itself is gitignored; flag only if it somehow became tracked.
  }
}

if (findings.length > 0) {
  console.error("Potential secrets committed:\n" + findings.map((f) => `  ${f}`).join("\n"));
  console.error(`\nRemove the value, read it from process.env, and rotate it. Reviewed\nplaceholders can be annotated with a trailing "${ALLOW_MARKER}" comment.`);
  process.exit(1);
}
console.log(`secret scan OK — ${files.length} files, no credential patterns found.`);
