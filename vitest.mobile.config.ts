import path from "node:path";
import { defineConfig } from "vitest/config";

// The Expo app cannot run under Node: its imports resolve to native bridges
// (AsyncStorage, Haptics, expo-router, react-native itself) that only exist
// inside a device runtime. Rather than skip mobile tests entirely, this config
// swaps those bridges for small in-memory stubs so the *logic* in `mobile/lib`
// — formatting, ETA math, trip state, API shaping — is testable in-process.
//
// Rule: stubs only ever replace platform bridges. Nothing under `mobile/lib`
// is mocked out; the suites exercise the real shipped code.
const stub = (file: string) => path.resolve(import.meta.dirname, `mobile/test/stubs/${file}`);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(import.meta.dirname, "mobile/$1") },
      {
        find: "@react-native-async-storage/async-storage",
        replacement: stub("async-storage.ts"),
      },
      // Exact match only — `react-native-url-polyfill/auto` and friends are
      // real packages that must keep resolving to themselves.
      { find: /^react-native$/, replacement: stub("react-native.ts") },
      { find: /^react-native-url-polyfill\/auto$/, replacement: stub("noop.ts") },
      { find: "@notifee/react-native", replacement: stub("notifee.ts") },
      { find: "@supabase/supabase-js", replacement: stub("supabase-js.ts") },
      { find: "expo-router", replacement: stub("expo-router.ts") },
      { find: "expo-haptics", replacement: stub("expo-haptics.ts") },
      { find: "expo-constants", replacement: stub("expo-constants.ts") },
      { find: "expo-localization", replacement: stub("expo-localization.ts") },
    ],
  },
  test: {
    environment: "node",
    globals: false,
    include: ["mobile/**/__tests__/**/*.{test,spec}.ts"],
    exclude: ["node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage-mobile",
      include: ["mobile/lib/**/*.ts"],
      // Hooks and native wrappers are thin bridges over device APIs; they are
      // covered by the on-device build, not by this Node harness.
      exclude: [
        "**/__tests__/**",
        "mobile/lib/use*.ts",
        "mobile/lib/*.native.ts",
        "mobile/lib/supabase.ts",
        "mobile/lib/db.ts",
        "mobile/lib/push.ts",
        "mobile/lib/notifications.ts",
        "mobile/lib/nfc.ts",
        "mobile/lib/cardScan.ts",
        "mobile/lib/liveActivities.ts",
        "mobile/lib/groupBackgroundLocation.ts",
        "mobile/lib/offline.ts",
        "mobile/lib/journey-types.ts",
      ],
    },
  },
});
