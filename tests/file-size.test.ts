import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hard ceiling on hand-written source files.
 *
 * 500 lines is the point where a module stops being reviewable in one sitting
 * and starts hiding behaviour. This test is the ratchet: a new god-file fails
 * CI rather than being discovered in an audit months later.
 *
 * Test files get a looser ceiling — a long suite is a table of cases, not
 * tangled logic — but they are still bounded so a suite cannot grow forever.
 */
const SOURCE_CEILING = 500;
const TEST_CEILING = 800;

const ROOTS = ["src", "packages", "workers", "mobile/lib", "tests", "scripts"];

/**
 * Files exempt from the ceiling, each with the reason it cannot shrink.
 * Adding an entry is a deliberate, reviewable act — never a default.
 */
const ALLOWLIST: Record<string, string> = {
  // Emitted by TanStack Router from the route tree; never hand-edited.
  "src/routeTree.gen.ts": "generated route manifest",
  // Emitted by the Supabase type generator from the live schema.
  "src/integrations/supabase/types.ts": "generated database types",
};

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".output",
  "coverage",
  "coverage-mobile",
  "__snapshots__",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|mjs|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const isTest = (file: string) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);

describe("file size ceiling", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const files = ROOTS.flatMap((root) => walk(path.join(repoRoot, root))).map((abs) =>
    path.relative(repoRoot, abs).split(path.sep).join("/"),
  );

  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("keeps every hand-written source file under the ceiling", () => {
    const offenders = files
      .filter((file) => !isTest(file) && !(file in ALLOWLIST))
      .map((file) => ({
        file,
        lines: readFileSync(path.join(repoRoot, file), "utf8").split("\n").length,
      }))
      .filter(({ lines }) => lines > SOURCE_CEILING)
      .map(({ file, lines }) => `${file} (${lines} lines)`);

    expect(
      offenders,
      `Split these into focused modules, or add a justified entry to ALLOWLIST:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps test suites under the looser ceiling", () => {
    const offenders = files
      .filter((file) => isTest(file) && !(file in ALLOWLIST))
      .map((file) => ({
        file,
        lines: readFileSync(path.join(repoRoot, file), "utf8").split("\n").length,
      }))
      .filter(({ lines }) => lines > TEST_CEILING)
      .map(({ file, lines }) => `${file} (${lines} lines)`);

    expect(offenders).toEqual([]);
  });

  it("has no stale allowlist entries", () => {
    const stale = Object.keys(ALLOWLIST).filter((file) => !files.includes(file));
    expect(
      stale,
      `Remove these from ALLOWLIST — they no longer exist: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});
