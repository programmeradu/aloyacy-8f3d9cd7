import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
const stub = (name: string) => path.resolve(root, "mobile/test/stubs", name);

/**
 * The Expo app cannot run under the web suite: its modules resolve through
 * Metro, not Vite, and half of them reach for native bridges that do not exist
 * in Node. This project keeps the framework-free half of `mobile/lib` honest —
 * formatting, fare and ETA maths, API request shaping — by aliasing the native
 * surface to small in-memory stubs and running the real module code against it.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(root, "mobile") + "/$1" },
      {
        find: /^@aloya\/core\/(.*)$/,
        replacement: path.resolve(root, "packages/core/src") + "/$1.ts",
      },
      { find: "@react-native-async-storage/async-storage", replacement: stub("async-storage.ts") },
      { find: "react-native", replacement: stub("react-native.ts") },
      { find: "expo-haptics", replacement: stub("expo-haptics.ts") },
      { find: "expo-router", replacement: stub("expo-router.ts") },
      { find: "expo-constants", replacement: stub("expo-constants.ts") },
    ],
  },
  test: {
    environment: "node",
    globals: false,
    dir: "mobile",
    include: ["**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["mobile/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "mobile/test/**"],
      // The global floor tracks the whole of `mobile/lib`, most of which is
      // still native-bridge code that cannot execute in Node — ratchet it up as
      // more pure modules gain suites. The per-glob floor guards the modules
      // that are already covered so they cannot regress.
      thresholds: {
        lines: 28,
        functions: 85,
        branches: 85,
        "mobile/lib/{api,plan,places,kapnos,airport,dust,reliability,walk,pnr,headsigns,format,eta-v2,trip-store,trip-chain,home-cards,nl-planner,motionPass,walletApi,walletFormat}.ts":
          { lines: 80, functions: 75, branches: 85 },
      },
    },

  },
});
