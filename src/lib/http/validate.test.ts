import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  jsonResponse,
  badRequest,
  zodDetails,
  parseWith,
  parseJsonBody,
  parseQuery,
} from "./validate";

const CORS = { "Access-Control-Allow-Origin": "*" };

const Body = z.object({ name: z.string().min(2), age: z.number().int().min(0) });

function post(body: string) {
  return new Request("https://app.aloya.cy/api/public/x", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

describe("jsonResponse", () => {
  it("serialises the body and merges caller headers", async () => {
    const res = jsonResponse(201, { ok: true }, CORS);
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("badRequest", () => {
  it("uses a stable error shape", async () => {
    const res = badRequest("Invalid request", ["name: too small"], CORS);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request", details: ["name: too small"] });
  });
});

describe("zodDetails", () => {
  it("formats path and message", () => {
    const result = Body.safeParse({ name: "a", age: -1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(zodDetails(result.error)).toEqual([
      expect.stringContaining("name:"),
      expect.stringContaining("age:"),
    ]);
  });

  it("caps the number of issues reported", () => {
    const Wide = z.object(
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}`, z.string()])),
    );
    const result = Wide.safeParse({});
    if (result.success) throw new Error("expected failure");
    expect(zodDetails(result.error)).toHaveLength(8);
    expect(zodDetails(result.error, 3)).toHaveLength(3);
  });

  it("falls back to the bare message when there is no path", () => {
    const result = z.string().safeParse(42);
    if (result.success) throw new Error("expected failure");
    expect(zodDetails(result.error)[0]).toBe(result.error.issues[0].message);
  });
});

describe("parseWith", () => {
  it("returns typed data on success", () => {
    const parsed = parseWith(Body, { name: "Andreas", age: 30 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.name).toBe("Andreas");
  });

  it("returns a 400 response on failure", async () => {
    const parsed = parseWith(Body, { name: "a" }, CORS);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.response.status).toBe(400);
    expect(parsed.response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("parseJsonBody", () => {
  it("accepts a valid payload", async () => {
    const parsed = await parseJsonBody(post(JSON.stringify({ name: "Maria", age: 4 })), Body);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual({ name: "Maria", age: 4 });
  });

  it("rejects malformed JSON with 400, not a thrown error", async () => {
    const parsed = await parseJsonBody(post("{not json"), Body, CORS);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.response.status).toBe(400);
    expect(await parsed.response.json()).toMatchObject({ error: "Invalid JSON body" });
  });

  it("rejects a well-formed payload that fails the schema", async () => {
    const parsed = await parseJsonBody(post(JSON.stringify({ name: "x", age: "old" })), Body);
    expect(parsed.ok).toBe(false);
  });
});

describe("parseQuery", () => {
  const Query = z.object({ lat: z.coerce.number(), q: z.string().optional() });

  it("reads from a URL", () => {
    const parsed = parseQuery(new URL("https://a.cy/x?lat=35.1&q=hello"), Query);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual({ lat: 35.1, q: "hello" });
  });

  it("reads from a URLSearchParams and a raw string", () => {
    expect(parseQuery(new URLSearchParams("lat=34"), Query).ok).toBe(true);
    expect(parseQuery("https://a.cy/x?lat=34", Query).ok).toBe(true);
  });

  it("keeps the last value when a key repeats", () => {
    const parsed = parseQuery("https://a.cy/x?lat=1&lat=2", Query);
    if (!parsed.ok) throw new Error("expected success");
    expect(parsed.data.lat).toBe(2);
  });

  it("400s on a missing required param", () => {
    const parsed = parseQuery("https://a.cy/x", Query, CORS);
    expect(parsed.ok).toBe(false);
  });
});
