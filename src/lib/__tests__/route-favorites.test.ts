// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import {
  isRouteStarred,
  isRouteNotifyEnabled,
  toggleStarredRoute,
  setRouteNotifyDisruptions,
} from "../route-favorites";

describe("route-favorites", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("checks whether a route is starred or has notifications enabled", () => {
    expect(isRouteStarred("101")).toBe(false);
    expect(isRouteNotifyEnabled("101")).toBe(false);
  });

  it("toggles starring a route on and off", () => {
    const added = toggleStarredRoute("101", {
      routeShort: "101",
      agency: "osel",
      notifyDisruptions: true,
    });
    expect(added).toBe(true);
    expect(isRouteStarred("101")).toBe(true);
    expect(isRouteNotifyEnabled("101")).toBe(true);

    const removed = toggleStarredRoute("101");
    expect(removed).toBe(false);
    expect(isRouteStarred("101")).toBe(false);
  });

  it("updates notify disruptions preference for starred routes", () => {
    toggleStarredRoute("200", { routeShort: "200" });
    expect(isRouteNotifyEnabled("200")).toBe(true);

    setRouteNotifyDisruptions("200", false);
    expect(isRouteNotifyEnabled("200")).toBe(false);

    setRouteNotifyDisruptions("200", true);
    expect(isRouteNotifyEnabled("200")).toBe(true);
  });
});
