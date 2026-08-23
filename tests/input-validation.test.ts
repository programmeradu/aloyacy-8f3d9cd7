// Input-validation guard for the public HTTP surface.
//
// Everything under `src/routes/api/public/**` is reachable without app auth,
// so each handler owns its own trust boundary. The rule this suite enforces is
// narrow and mechanical: a handler that *reads* caller-supplied input — a JSON
// body, a query string, a path param, multipart form data — must run that
// input through a schema (`src/lib/http/validate.ts`, `src/lib/http/og-params.ts`,
// or a Zod `safeParse`/`parse` of its own) before acting on it.
//
// Handlers that read nothing from the caller (static JSON dumps, health, cron
// ticks authenticated purely by header secret) are not exempted by hand: the
// scan simply does not find an input read in them, so they pass. The explicit
// allowlist below is only for handlers whose input is not schema-shaped
// (binary uploads), and each entry carries the reason it is safe.

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
    // Multipart audio upload: a Zod schema cannot describe a Blob's bytes. The
    // handler rejects a non-multipart request, a missing `file` part, a
    // non-Blob part, and anything outside a 512 B – 20 MB size window.
    "binary multipart upload guarded by explicit type and size checks",
  ],
  [
    "src/routes/api/public/hooks/pulse-traffic.ts",
    // The only caller-supplied value is a `cron_secret` query param, compared
    // by equality against the configured secret before anything else runs.
    // There is no payload to shape — the handler pulls its data from upstream.
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
  /parseJsonInput\s*\(/,
  /parseOptionalJsonBody\s*\(/,
  /parseQueryInput\s*\(/,
  /parseJsonBody\s*\(/,
  /parseQuery\s*\(/,
  /parseInput\s*\(/,
  /parseWith\s*\(/,
  /safeGroupCode\s*\(/,
  /safePlanToken\s*\(/,
  /\.safeParse\s*\(/,
  // A locally declared schema parsed directly, e.g. `Body.parse(await request.json())`.
  /\b[A-Z]\w*\s*\.\s*parse\s*\(/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

/** Strips line and block comments so prose about params cannot trip the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("public API endpoints validate caller input", () => {
  const files = walk(PUBLIC_API);

  it("scans the whole public surface", () => {
    // Guards the guard: a broken walk would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(40);
  });

  it("has no allowlist entry pointing at a file that no longer exists", () => {
    for (const file of ALLOWED.keys()) expect(files).toContain(file);
  });

  it("runs every caller-supplied input through a schema", () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (ALLOWED.has(file)) continue;
      const source = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
      const readsInput = INPUT_READS.some((re) => re.test(source));
      if (!readsInput) continue;
      if (VALIDATORS.some((re) => re.test(source))) continue;
      offenders.push(file);
    }

    expect(offenders, `unvalidated public handlers:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});
