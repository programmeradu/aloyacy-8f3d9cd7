import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "mobile",
      "coverage",
      // Generated or vendor-owned sources — not hand-maintained.
      "src/routeTree.gen.ts",
      "src/integrations/supabase/types.ts",
      "src/routes/lovable/**",
      // Generated font payloads and MCP transport shims (vendor-formatted).
      "src/lib/og-fonts.server.ts",
      "src/routes/mcp.ts",
      "src/routes/\\[.mcp\\]/**",
      "src/routes/\\[.well-known\\]/**",
      "agent/**",
      ".agents/**",
      ".workspace/**",
      "19cfc1d7/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Deliberate best-effort blocks (feature detection, storage access) are
      // allowed to swallow their error; every other empty block is a defect.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Providers, shadcn primitives and email builders intentionally export
    // hooks/variants alongside components; Fast Refresh granularity is not a
    // quality signal for these vendor-shaped modules.
    files: [
      "src/components/ui/**/*.tsx",
      "src/lib/email-templates/**/*.tsx",
      "src/lib/useAuth.tsx",
      "src/lib/usePro.tsx",
    ],
    rules: { "react-refresh/only-export-components": "off" },
  },
  eslintPluginPrettier,
);
