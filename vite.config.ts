// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// Only load Lovable MCP plugin when running inside Lovable sandbox
const isLovableSandbox =
  process.env.LOVABLE_SANDBOX === "1" || Boolean(process.env.DEV_SERVER__PROJECT_PATH);

export default defineConfig({
  nitro: false,
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      // ROAM_LOWMEM=1 is a temporary sandbox-only switch (low RAM build); unset for normal builds.
      ...(process.env.ROAM_LOWMEM === "1"
        ? { minify: process.env.ROAM_NOMINIFY === "1" ? false : "esbuild", sourcemap: false, reportCompressedSize: false }
        : {}),
      rollupOptions: {
        external: [/^cloudflare:/, /\.wasm$/],
        ...(process.env.ROAM_LOWMEM === "1" ? { maxParallelFileOps: 2 } : {}),
      },
    },
    plugins: [],
  },
});
