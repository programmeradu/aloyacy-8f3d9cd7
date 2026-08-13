import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const autocompletePlaces = vi.fn();
const resolvePlace = vi.fn();
vi.mock("../places", () => ({
  autocompletePlaces: (...a: unknown[]) => autocompletePlaces(...a),
  resolvePlace: (...a: unknown[]) => resolvePlace(...a),
}));

import { resolveAskAloya } from "../nl-planner";

const originalFetch = globalThis.fetch;

function mockParser(body: unknown, ok = true) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status: ok ? 200 : 500 }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function place(label: string, lat = 34.7, lng = 33.0) {
  return { lat, lng, name: label };
}

beforeEach(() => {
  autocompletePlaces.mockReset();
  resolvePlace.mockReset();
  autocompletePlaces.mockImplementation(async ({ query }: { query: string }) => [
    { placeId: `p:${query}`, primary: query, secondary: "Cyprus" },
  ]);
  resolvePlace.mockImplementation(async (id: string) => place(id.replace(/^p:/, "")));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("resolveAskAloya", () => {
  it("geocodes both endpoints from a server-parsed intent", async () => {
    mockParser({
      from: "Nicosia Mall",
      to: "Larnaca Airport",
      leaveByISO: null,
      arriveByISO: "2026-08-23T09:00:00.000Z",
      confidence: 0.9,
    });

    const result = await resolveAskAloya("from Nicosia Mall to Larnaca Airport by 9");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seed.from?.label).toBe("Nicosia Mall");
    expect(result.seed.to.label).toBe("Larnaca Airport");
    expect(result.seed.arriveByISO).toBe("2026-08-23T09:00:00.000Z");
    expect(result.seed.rawText).toBe("from Nicosia Mall to Larnaca Airport by 9");
  });

  it("passes the location bias through to both geocodes", async () => {
    mockParser({ from: "Finikoudes", to: "Mackenzie", leaveByISO: null, arriveByISO: null, confidence: 1 });
    const bias = { lat: 34.9, lng: 33.6 };
    await resolveAskAloya("from Finikoudes to Mackenzie", bias);
    expect(autocompletePlaces).toHaveBeenCalledWith({ query: "Mackenzie", bias });
    expect(autocompletePlaces).toHaveBeenCalledWith({ query: "Finikoudes", bias });
  });

  it("treats self-references as 'from my current location'", async () => {
    mockParser({ from: "my place", to: "Paphos Harbour", leaveByISO: null, arriveByISO: null, confidence: 0.8 });
    const result = await resolveAskAloya("from my place to Paphos Harbour");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seed.from).toBeNull();
    expect(autocompletePlaces).toHaveBeenCalledTimes(1);
  });

  it("leaves the origin null when the parser found none", async () => {
    mockParser({ from: null, to: "Kyrenia Gate", leaveByISO: null, arriveByISO: null, confidence: 0.7 });
    const result = await resolveAskAloya("to Kyrenia Gate");
    expect(result.ok && result.seed.from).toBeNull();
  });

  it("falls back to the local heuristic when the parser is down", async () => {
    mockParser({}, false);
    const result = await resolveAskAloya("from Ledra Street to Eleftheria Square");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seed.to.label).toBe("Eleftheria Square");
    expect(result.seed.from?.label).toBe("Ledra Street");
  });

  it("falls back when the parser answers without a destination", async () => {
    mockParser({ from: "Ledra Street", to: null, leaveByISO: null, arriveByISO: null, confidence: 0.2 });
    const result = await resolveAskAloya("to Eleftheria Square");
    expect(result.ok && result.seed.to.label).toBe("Eleftheria Square");
  });

  it("falls back when the network rejects outright", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await resolveAskAloya("to Limassol Marina");
    expect(result.ok && result.seed.to.label).toBe("Limassol Marina");
  });

  it("derives a leave-by time from 'in N minutes' in the heuristic path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T06:00:00.000Z"));
    mockParser({}, false);
    const result = await resolveAskAloya("to Larnaca Airport in 25 minutes");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seed.leaveByISO).toBe("2026-08-23T06:25:00.000Z");
  });

  it("reports a parse failure when nothing resembles a destination", async () => {
    mockParser({}, false);
    const result = await resolveAskAloya("hello there");
    expect(result).toEqual({ ok: false, reason: "parse", rawText: "hello there" });
    expect(autocompletePlaces).not.toHaveBeenCalled();
  });

  it("reports a geocode failure with the unresolved place as a hint", async () => {
    mockParser({ from: null, to: "Atlantis", leaveByISO: null, arriveByISO: null, confidence: 0.9 });
    autocompletePlaces.mockResolvedValue([]);
    const result = await resolveAskAloya("to Atlantis");
    expect(result).toEqual({ ok: false, reason: "geocode", rawText: "to Atlantis", hint: "Atlantis" });
  });

  it("reports a geocode failure when place details cannot be resolved", async () => {
    mockParser({ from: null, to: "Somewhere", leaveByISO: null, arriveByISO: null, confidence: 0.9 });
    resolvePlace.mockRejectedValue(new Error("details 404"));
    const result = await resolveAskAloya("to Somewhere");
    expect(result).toMatchObject({ ok: false, reason: "geocode" });
  });

  it("keeps the destination when only the origin fails to geocode", async () => {
    mockParser({ from: "Nowhere", to: "Paphos", leaveByISO: null, arriveByISO: null, confidence: 0.9 });
    autocompletePlaces.mockImplementation(async ({ query }: { query: string }) =>
      query === "Paphos" ? [{ placeId: "p:Paphos", primary: "Paphos" }] : [],
    );
    const result = await resolveAskAloya("from Nowhere to Paphos");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seed.from).toBeNull();
    expect(result.seed.to.label).toBe("Paphos");
  });

  it("falls back to the suggestion label when place details carry no name", async () => {
    mockParser({ from: null, to: "Kolossi", leaveByISO: null, arriveByISO: null, confidence: 0.9 });
    resolvePlace.mockResolvedValue({ lat: 34.6, lng: 32.9, name: "" });
    const result = await resolveAskAloya("to Kolossi");
    expect(result.ok && result.seed.to.label).toBe("Kolossi");
  });
});
