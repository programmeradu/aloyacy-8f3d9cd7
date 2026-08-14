// Observability guard.
//
// Server-side code runs in a Worker where the only way to find out what
// happened is the log line itself. A bare `console.log("something failed", e)`
// produces an unsearchable string; the structured logger emits one JSON object
// per line with `level`, `scope` and typed fields, which log search can filter.
//
// This test walks every server-executed file and fails if a raw console call
// creeps back in. Client code is deliberately out of scope: there, `console`
// *is* the developer-facing surface (it shows up in devtools) and there is no
// log aggregator to feed.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Directories whose files only ever execute on the server. */
const SERVER_DIRS = ["src/routes/api", "src/routes/lovable"];

/**
 * Files exempt from the rule, each with the reason. Keep this list short and
 * justified — an entry here is a spot log search cannot reach.
 */
const ALLOWED = new Set<string>([
  // The logger's own console sink: this is where the JSON line is written.
  "src/lib/logger.ts",
]);

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(ROOT, rel)).isDirectory()) {
      out.push(...walk(rel));
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

// Matches `console.log(` / `console.error(` etc., ignoring occurrences inside
// a line comment so explanatory prose about logging does not trip the rule.
const CONSOLE_CALL = /(^|[^.\w])console\s*\.\s*(log|info|warn|error|debug)\s*\(/;

describe("server code logs through the structured logger", () => {
  const files = SERVER_DIRS.flatMap(walk).filter((f) => !ALLOWED.has(f));

  it("scans a non-trivial set of server files", () => {
    // Guards the guard: a broken glob would silently make this suite vacuous.
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)("%s uses no raw console call", (file) => {
    const offenders = readFileSync(path.join(ROOT, file), "utf8")
      .split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(
        ({ line }) => !line.startsWith("//") && !line.startsWith("*") && CONSOLE_CALL.test(line),
      );

    expect(
      offenders.map((o) => `${file}:${o.no} ${o.line}`),
      "use createLogger(scope) from @/lib/logger instead of console.*",
    ).toEqual([]);
  });
});
