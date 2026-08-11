// Setup file for component suites: registers jest-dom's DOM matchers
// (`toBeInTheDocument`, `toHaveAccessibleName`, `toBeEmptyDOMElement`, …) on
// vitest's `expect`.
//
// It deliberately does NOT install a global `cleanup()`: hook suites stub and
// restore browser globals (`navigator.geolocation`) around their own renders,
// and unmounting them after the stub is gone throws in effect teardown.
// Component suites unmount explicitly or via their own `afterEach(cleanup)`.
//
// Wired through `test.setupFiles` in vitest.config.ts; the matcher *types* come
// from `@testing-library/jest-dom/vitest` being listed in tsconfig `types`.
import "@testing-library/jest-dom/vitest";
