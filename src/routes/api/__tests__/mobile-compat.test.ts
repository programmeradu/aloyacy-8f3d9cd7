// Mobile compatibility endpoints on D1: user-settings, commute-suggestion,
// route-load. Real query builder over node:sqlite, real session tokens.
import { beforeEach, describe, expect, it } from "vitest";
import { setD1ForTests } from "@/lib/db";
import { createTestD1 } from "@/lib/db/__tests__/sqlite-d1";
import { setWorkerEnv } from "@/lib/worker-env";
import { createUser, sessionFor } from "@/lib/auth/session.server";
import { Route as SettingsRoute } from "@/routes/api/public/user-settings";
import { Route as CommuteRoute, riderClock } from "@/routes/api/public/commute-suggestion";
import { Route as LoadRoute } from "@/routes/api/public/route-load";
import { apiRequest, getHandler } from "./handler";

let d1: ReturnType<typeof createTestD1>;

beforeEach(() => {
  process.env.JWT_SECRET = "x".repeat(40);
  setWorkerEnv({ JWT_SECRET: process.env.JWT_SECRET });
  d1 = createTestD1();
  setD1ForTests(d1);
});

async function guest() {
  const user = await createUser();
  const { access_token } = await sessionFor(user);
  return { id: user.id, auth: { Authorization: `Bearer ${access_token}` } };
}

describe("/api/public/user-settings", () => {
  it("rejects calls without a session", async () => {
    const res = await getHandler(SettingsRoute, "GET")({ request: apiRequest("/api/public/user-settings") });
    expect(res.status).toBe(401);
  });

  it("returns null before anything is saved, then round-trips locale and prefs", async () => {
    const g = await guest();
    const get = () =>
      getHandler(SettingsRoute, "GET")({ request: apiRequest("/api/public/user-settings", { headers: g.auth }) });
    expect(await (await get()).json()).toEqual({ settings: null });

    const post = (body: unknown) =>
      getHandler(SettingsRoute, "POST")({
        request: apiRequest("/api/public/user-settings", {
          method: "POST",
          headers: { ...g.auth, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      });
    const prefs = { stepFree: true, preferShade: false, lowFloor: true, maxWalkMeters: 600 };
    expect((await post({ accessibility_prefs: prefs })).status).toBe(200);
    expect((await post({ locale: "el" })).status).toBe(200);

    const body = (await (await get()).json()) as { settings: { locale: string; accessibility_prefs: unknown } };
    expect(body.settings.locale).toBe("el");
    expect(body.settings.accessibility_prefs).toEqual(prefs);
  });

  it("rejects unknown columns and bad locales", async () => {
    const g = await guest();
    for (const body of [{ locale: "fr" }, { consent_analytics: true }, {}]) {
      const res = await getHandler(SettingsRoute, "POST")({
        request: apiRequest("/api/public/user-settings", {
          method: "POST",
          headers: { ...g.auth, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      });
      expect(res.status).toBe(400);
    }
  });

  it("only ever touches the caller's own row", async () => {
    const a = await guest();
    const b = await guest();
    await getHandler(SettingsRoute, "POST")({
      request: apiRequest("/api/public/user-settings", {
        method: "POST",
        headers: { ...a.auth, "content-type": "application/json" },
        body: JSON.stringify({ locale: "el" }),
      }),
    });
    const res = await getHandler(SettingsRoute, "GET")({ request: apiRequest("/api/public/user-settings", { headers: b.auth }) });
    expect(await res.json()).toEqual({ settings: null });
  });
});

describe("/api/public/commute-suggestion", () => {
  it("needs a session", async () => {
    const res = await getHandler(CommuteRoute, "GET")({ request: apiRequest("/api/public/commute-suggestion") });
    expect(res.status).toBe(401);
  });

  it("returns the rider's matching pattern in their local time", async () => {
    const g = await guest();
    const other = await guest();
    const wall = riderClock(new Date(), -180); // Cyprus summer, UTC+3
    const bucket = wall.getHours() * 2 + (wall.getMinutes() >= 30 ? 1 : 0);
    const ins = d1.raw.prepare(
      `INSERT INTO commute_patterns (user_id, from_h3, to_h3, dow_mask, time_bucket, count, from_label, to_label, from_lat, from_lng, to_lat, to_lng)
       VALUES (?, 'a', 'b', ?, ?, ?, ?, 'Work', 35.17, 33.36, 35.18, 33.37)`,
    );
    ins.run(g.id, 1 << wall.getDay(), bucket, 5, "Home");
    ins.run(other.id, 1 << wall.getDay(), bucket, 50, "Not yours");

    const res = await getHandler(CommuteRoute, "GET")({
      request: apiRequest("/api/public/commute-suggestion", { headers: g.auth, query: { tzOffset: -180 } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestion: { fromLabel: string; count: number; usualTime: string } };
    expect(body.suggestion.fromLabel).toBe("Home");
    expect(body.suggestion.count).toBe(5);
    expect(body.suggestion.usualTime).toMatch(/^\d{2}:(00|30)$/);
  });

  it("is null for a rider with no patterns", async () => {
    const g = await guest();
    const res = await getHandler(CommuteRoute, "GET")({ request: apiRequest("/api/public/commute-suggestion", { headers: g.auth }) });
    expect(await res.json()).toEqual({ suggestion: null });
  });
});

describe("/api/public/route-load", () => {
  it("validates routeId", async () => {
    const res = await getHandler(LoadRoute, "GET")({ request: apiRequest("/api/public/route-load") });
    expect(res.status).toBe(400);
  });

  it("aggregates recent windows, preferring the trip's own samples", async () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    const ins = d1.raw.prepare(
      "INSERT INTO route_load_estimates (trip_id, route_id, window_start, load_index, rider_count) VALUES (?, 'R1', ?, ?, ?)",
    );
    ins.run("T1", recent, 0.9, 30);
    ins.run("T2", recent, 0.1, 2);
    const call = async (query: Record<string, string>) =>
      (await getHandler(LoadRoute, "GET")({ request: apiRequest("/api/public/route-load", { query }) })).json();
    expect(await call({ routeId: "R1", tripId: "T1" })).toMatchObject({ level: "packed", sample: 1 });
    expect(await call({ routeId: "R1" })).toMatchObject({ level: "moderate", sample: 2 });
    expect(await call({ routeId: "NOPE" })).toEqual({ level: null, riders: 0, sample: 0 });
  });
});
