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
    if (importer?.includes("react-start-shim")) return null;
    if (id === "@tanstack/react-start")
      return path.resolve(import.meta.dirname, "src/test/react-start-shim.ts");
    if (id === "@tanstack/react-start/server")
      return path.resolve(import.meta.dirname, "src/test/react-start-server-shim.ts");
    return null;
  },
};

export default defineConfig({
  plugins: [tsconfigPaths(), startShim],

  test: {
    environment: "node",
    // Server modules read their configuration from `process.env` at call time
    // and throw when it is absent. Seed inert placeholders so suites exercise
    // real code paths instead of the "not configured" guard; any test that
    // cares about a specific value overrides it with `vi.stubEnv`.
    env: {
      CUSTOM_SUPABASE_URL: "http://supabase.test",
      CUSTOM_SUPABASE_ANON_KEY: "test-anon-key",
      CUSTOM_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      CUSTOM_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      VITE_SUPABASE_URL: "http://supabase.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    },
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
        lines: 75,
        statements: 75,
        functions: 90,
        branches: 88,
        "packages/core/src/**/*.ts": {
          lines: 78,
          statements: 78,
          functions: 85,
          branches: 88,
        },
      },
    },
  },
});
