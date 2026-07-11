import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
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
      exclude: ["**/*.test.ts", "**/*.server.ts", "**/dictionaries/**"],
      // Enforced floors, ratcheted upward as tests land. The shared domain
      // core is the part every client depends on, so it carries a much
      // higher bar than the app-glue average.
      thresholds: {
        lines: 12,
        statements: 12,
        functions: 60,
        branches: 80,
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
