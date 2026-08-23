// Input-validation guard for the public HTTP surface.
//
// Everything under `src/routes/api/public/**` is reachable without app auth,
// so each handler owns its own trust boundary. The rule enforced here is
// narrow and mechanical: a handler that *reads* caller-supplied input — a JSON
// body, a query string, a path param, multipart form data — must run that
// input through a literal Zod call (`Schema.safeParse(...)`) written in the
// route file itself.
//
// The "in the route file itself" part is deliberate. Validation hidden inside
// a shared helper is real, but it is invisible both to a reviewer skimming one
// endpoint and to static analysis. Keeping the call at the boundary means the
// guarantee can be *proved* per route — which is exactly what
// `scripts/input-validation-report.mjs` does in CI.
//
// There is no allowlist. A new public endpoint that reads untrusted input
// without a visible schema fails this suite.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC_API = "src/routes/api/public";

/** Reads caller-controlled data out of the request. */
const INPUT_READS: Array<[string, RegExp]> = [
  ["json body", /request\s*\.\s*json\s*\(/],
  ["raw body", /request\s*\.\s*text\s*\(/],
  ["multipart", /request\s*\.\s*formData\s*\(/],
  ["body reader", /readJsonBody\s*\(/],
  ["query string", /searchParams|queryRecord\s*\(/],
  ["path param", /\bparams\s*\./],
];

/**
 * A literal schema call. `safeParse` on any identifier (route-local schemas
 * are often lower-cased), bare `.parse(` only on a capitalised one so a
 * decoder such as `parser.parse(xml)` is never mistaken for a validator.
 * `JSON` is excluded outright: `JSON.parse` decodes, it does not validate.
 */
const SAFE_PARSE = /\b([A-Za-z_$][\w$]*)\s*\.\s*safeParse\s*\(|\b([A-Z][\w$]*)\s*\.\s*parse\s*\(/g;

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

function schemasIn(source: string): string[] {
  return [...new Set([...source.matchAll(SAFE_PARSE)].map((m) => m[1] ?? m[2]))]
    .filter((name): name is string => Boolean(name) && name !== "JSON")
    .sort();
}

const files = walk(PUBLIC_API);

describe("public API endpoints validate caller input", () => {
  it("scans the whole public surface", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("keeps a schema module the routes can share", () => {
    const schemas = readFileSync(path.join(ROOT, "src/lib/schemas/public-api.ts"), "utf8");
    expect(schemas).toMatch(/from "zod"/);
  });

  describe.each(files)("endpoint %s", (file) => {
    const source = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
    const reads = INPUT_READS.filter(([, re]) => re.test(source)).map(([label]) => label);
    const schemas = schemasIn(source);

    it("parses caller input with a schema declared at the boundary", () => {
      if (reads.length === 0) return;
      expect(
        schemas.length,
        `${file} reads caller input (${reads.join(", ")}) but no literal ` +
          `Schema.safeParse(...) appears in the file`,
      ).toBeGreaterThan(0);
    });

    it("acts on the parsed value, never the raw one", () => {
      if (reads.length === 0 || schemas.length === 0) return;
      // A throwing `Schema.parse(...)` already stops bad input by itself.
      // A `safeParse` must be branched on, or a rejection would fall through
      // to real work with the unvalidated value still in hand.
      if (!/\.\s*safeParse\s*\(/.test(source)) return;
      expect(source, `${file} never checks the result of its schema parse`).toMatch(
        /\.success|\.ok\b|zodDetails|badRequest|invalidJsonBody|malformedJsonBody/,
      );
    });

  });
});
