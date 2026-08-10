// Setup file for component suites: registers jest-dom's DOM matchers
// (`toBeInTheDocument`, `toHaveAccessibleName`, `toBeEmptyDOMElement`, …) on
// vitest's `expect` and tears the rendered tree down between tests so one
// component's markup can never leak into the next assertion.
//
// Wired through `test.setupFiles` in vitest.config.ts; the matcher *types* come
// from `@testing-library/jest-dom/vitest` being listed in tsconfig `types`.
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
