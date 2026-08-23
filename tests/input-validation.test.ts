// Input-validation guard for the public HTTP surface.
//
// Everything under `src/routes/api/public/**` is reachable without app auth,
// so each handler owns its own trust boundary. The rule this suite enforces is
// narrow and mechanical: a handler that *reads* caller-supplied input — a JSON
// body, a query string, a path param, multipart form data — must run that
// input through a schema (`src/lib/http/validate.ts`, `src/lib/http/og-params.ts`,
// or a Zod `safeParse`/`parse` of its own) before acting on it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC_API = "src/routes/api/public";

/**
 * Handlers whose caller input is not JSON/query shaped, validated instead by
 * explicit runtime guards in the file. Adding an entry requires the reason.
 */
const ALLOWED = new Map<string, string>([
  [
    "src/routes/api/public/stt.ts",
    "binary multipart upload guarded by explicit type and size checks",
  ],
  [
    "src/routes/api/public/hooks/pulse-traffic.ts",
    "cron tick: sole query param is a shared secret checked by equality",
  ],
]);

/** Reads caller-controlled data out of the request. */
const INPUT_READS = [
  /request\s*\.\s*json\s*\(/,
  /request\s*\.\s*text\s*\(/,
  /request\s*\.\s*formData\s*\(/,
  /searchParams/,
  /\bparams\s*\./,
  /\bparams\b\s*[,)}]/,
];

/** Runs that data through a schema before it is used. */
const VALIDATORS = [
  // Only literal explicit safeParse or parse calls are accepted
  /\.safeParse\s*\(/,
  /\b[A-Z]\w*\s*\.\s*parse\s*\(/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(rel.split(path.sep).join("/"));
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("public API endpoints validate caller input", () => {
  const files = walk(PUBLIC_API);

  it("scans the whole public surface", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("has no allowlist entry pointing at a file that no longer exists", () => {
    for (const file of ALLOWED.keys()) expect(files).toContain(file);
  });

  describe.each(files)("endpoint %s", (file) => {
    it("validates input with a schema if caller data is read", () => {
      const normalized = file.split(path.sep).join("/");
      if (ALLOWED.has(normalized)) return;
      const source = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
      const readsInput = INPUT_READS.some((re) => re.test(source));
      if (!readsInput) return;
      const hasValidator = VALIDATORS.some((re) => re.test(source));
      expect(
        hasValidator,
        `Public endpoint ${file} reads caller input without validating via schema`,
      ).toBe(true);
    });
  });
});
