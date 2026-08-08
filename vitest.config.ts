import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Under test there is no Start Vite plugin to split `createServerFn().handler()`
// into a client stub plus an extracted server handler, so the real factory
// resolves to `undefined`. Swap the package for an in-process shim that runs
// the validator, middleware and handler for real. The shim's own import of the
// package is left alone so the other exports stay genuine.
const startShim = {
  name: "aloya:react-start-test-shim",
  enforce: "pre" as const,
  resolveId(id: string, importer?: string) {
    if (id !== "@tanstack/react-start") return null;
    if (importer?.includes("react-start-shim")) return null;
    return path.resolve(import.meta.dirname, "src/test/react-start-shim.ts");
  },
};

export default defineConfig({
  plugins: [tsconfigPaths(), startShim],

  test: {
    environment: "node",
    globals: false,
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "packages/*/src/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
    ],
    // The Expo app has its own runtime and is exercised separately.
    exclude: ["node_modules/**", "mobile/**", ".output/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.ts", "packages/core/src/**/*.ts"],
      // Translation dictionaries are data, not logic — counting them would
      // dilute the signal without telling us anything about behaviour.
      // `*-types.ts` / `plan-types.ts` are type-only re-export barrels: they
      // emit no runtime statements worth asserting on.
      exclude: [
        "**/*.test.ts",
        "**/*.server.ts",
        "**/dictionaries/**",
        "**/*-types.ts",
        "src/lib/headsigns.ts", // one-line re-export of packages/core/headsigns
      ],

      // Enforced floors, ratcheted upward as tests land. The shared domain
      // core is the part every client depends on, so it carries a much
      // higher bar than the app-glue average.
      thresholds: {
        lines: 58,
        statements: 58,
        functions: 90,
        branches: 88,
        "packages/core/src/**/*.ts": {
          lines: 70,
          statements: 70,
          functions: 80,
          branches: 85,
        },
      },
    },
  },
});
