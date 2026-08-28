import { describe, expect, it } from "vitest";
import { STOP_INDEX_RATED_MIN } from "./stop-index";
import { ROUTE_INDEX_RATED_MIN, routeIndexable } from "./route-index";

describe("routeIndexable", () => {
  it("uses the same 30-sample bar as the reliability badge", () => {
    expect(ROUTE_INDEX_RATED_MIN).toBe(STOP_INDEX_RATED_MIN);
    expect(routeIndexable(29)).toBe(false);
    expect(routeIndexable(30)).toBe(true);
    expect(routeIndexable(Number.NaN)).toBe(false);
  });
});
