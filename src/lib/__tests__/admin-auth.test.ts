import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminGate, isAdminPath, isAdminRequest } from "../admin-auth.server";
import { signToken } from "../auth/session.server";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock } from "./supabase-mock";

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({ training_events: () => ({ data: [], error: null }) });
  return { supabaseAdmin: client };
});

const { getQaStats } = await import("../qa.functions");
const { assertAdminPage } = await import("../admin.functions");

const SECRET = "s3cret-admin-header-value";
const JWT = "x".repeat(40);

async function bearer(claims: { email: string | null; is_anonymous: boolean }) {
  const { token } = await signToken({ sub: "user-1", ...claims });
  return { authorization: `Bearer ${token}` };
}

function at(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://app.aloya.cy${path}`, { headers });
}

// Every internal / admin / debug / ops surface under src/routes.
const PROTECTED = [
  "/admin/seo",
  "/debug/eta",
  "/debug/graph",
  "/debug/multileg",
  "/internal/bedrock",
  "/internal/bedrock-usage",
  "/internal/funding",
  "/internal/funding/",
  "/internal/funding/docs",
  "/qa",
  "/metrics",
  "/api/public/metrics",
  "/api/public/bedrock-test",
];

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", JWT);
  vi.stubEnv("ADMIN_SECRET", "");
  vi.stubEnv("ADMIN_EMAILS", "");
  vi.stubEnv("METRICS_TOKEN", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("isAdminPath", () => {
  it.each(PROTECTED)("covers %s", (p) => expect(isAdminPath(p)).toBe(true));

  it.each(["/", "/plan/abc", "/stop/1", "/administrator", "/qa-tips", "/api/public/health", "/healthz", "/api/public/hooks/train"])(
    "leaves %s alone",
    (p) => expect(isAdminPath(p)).toBe(false),
  );
});

describe("isAdminRequest", () => {
  it("fails closed when neither ADMIN_SECRET nor ADMIN_EMAILS is set", async () => {
    expect(await isAdminRequest(at("/qa", { "x-aloya-admin": "" }))).toBe(false);
    expect(await isAdminRequest(at("/qa", await bearer({ email: "a@b.cy", is_anonymous: false })))).toBe(false);
  });

  it("accepts the exact x-aloya-admin header only", async () => {
    vi.stubEnv("ADMIN_SECRET", SECRET);
    expect(await isAdminRequest(at("/qa", { "x-aloya-admin": SECRET }))).toBe(true);
    expect(await isAdminRequest(at("/qa", { "x-aloya-admin": `${SECRET}x` }))).toBe(false);
    expect(await isAdminRequest(at("/qa"))).toBe(false);
  });

  it("accepts a signed session whose email is in ADMIN_EMAILS (case-insensitive)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "ops@aloya.cy, Boss@Aloya.cy");
    expect(await isAdminRequest(at("/qa", await bearer({ email: "boss@aloya.cy", is_anonymous: false })))).toBe(true);
    const cookie = (await bearer({ email: "ops@aloya.cy", is_anonymous: false })).authorization.slice(7);
    expect(await isAdminRequest(at("/qa", { cookie: `aloya_session=${cookie}` }))).toBe(true);
  });

  it("rejects other emails, anonymous sessions and forged tokens", async () => {
    vi.stubEnv("ADMIN_EMAILS", "ops@aloya.cy");
    expect(await isAdminRequest(at("/qa", await bearer({ email: "rider@x.cy", is_anonymous: false })))).toBe(false);
    expect(await isAdminRequest(at("/qa", await bearer({ email: "ops@aloya.cy", is_anonymous: true })))).toBe(false);
    const { authorization } = await bearer({ email: "ops@aloya.cy", is_anonymous: false });
    vi.stubEnv("JWT_SECRET", "y".repeat(40)); // token now signed with the wrong key
    expect(await isAdminRequest(at("/qa", { authorization }))).toBe(false);
  });
});

describe("adminGate (Worker entry)", () => {
  it.each(PROTECTED)("404s the public on %s", async (p) => {
    vi.stubEnv("ADMIN_SECRET", SECRET);
    const res = await adminGate(at(p));
    expect(res?.status).toBe(404);
  });

  it.each(PROTECTED)("lets an admin through to %s", async (p) => {
    vi.stubEnv("ADMIN_SECRET", SECRET);
    expect(await adminGate(at(p, { "x-aloya-admin": SECRET }))).toBeNull();
  });

  it("does not touch public routes", async () => {
    expect(await adminGate(at("/plan/abc"))).toBeNull();
  });

  it("still lets a Prometheus scraper in with METRICS_TOKEN", async () => {
    vi.stubEnv("METRICS_TOKEN", "scrape");
    expect(await adminGate(at("/metrics", { authorization: "Bearer scrape" }))).toBeNull();
    expect((await adminGate(at("/metrics", { authorization: "Bearer nope" })))?.status).toBe(404);
    // The scrape token is not an admin credential for other internal pages.
    expect((await adminGate(at("/qa", { authorization: "Bearer scrape" })))?.status).toBe(404);
  });
});

describe("server functions behind internal pages", () => {
  it("refuses getQaStats without an admin credential", async () => {
    vi.stubEnv("ADMIN_SECRET", SECRET);
    await expect(callServerFn(getQaStats, { days: 7 })).rejects.toThrow("Not Found");
  });

  it("serves getQaStats to an admin", async () => {
    vi.stubEnv("ADMIN_SECRET", SECRET);
    const out = await callServerFn(getQaStats, { days: 7 }, { headers: { "x-aloya-admin": SECRET } });
    expect(out).toBeTruthy();
  });

  it("assertAdminPage throws a router notFound for non-admins", async () => {
    vi.stubEnv("ADMIN_SECRET", SECRET);
    await expect(assertAdminPage()).rejects.toMatchObject({ isNotFound: true });
  });
});
