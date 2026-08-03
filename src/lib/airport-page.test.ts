import { describe, it, expect } from "vitest";
import {
  isAirportCode,
  buildAirportFaq,
  AIRPORT_COPY,
  AIRPORT_STOP,
  ALLOWED_AIRPORTS,
  airportHead,
} from "./airport-page";

describe("isAirportCode", () => {
  it("accepts known codes case-insensitively", () => {
    expect(isAirportCode("lca")).toBe(true);
    expect(isAirportCode("LCA")).toBe(true);
    expect(isAirportCode("pfo")).toBe(true);
  });

  it("rejects unknown codes", () => {
    expect(isAirportCode("xyz")).toBe(false);
    expect(isAirportCode("")).toBe(false);
  });
});

describe("AIRPORT_STOP / ALLOWED_AIRPORTS", () => {
  it("has a stop id for every allowed airport", () => {
    for (const code of ALLOWED_AIRPORTS) {
      expect(AIRPORT_STOP[code]).toBeTruthy();
    }
  });
});

describe("buildAirportFaq", () => {
  it("builds three FAQ entries referencing the city", () => {
    const faq = buildAirportFaq("Larnaca");
    expect(faq).toHaveLength(3);
    expect(faq[0].q).toContain("Larnaca");
    for (const item of faq) {
      expect(item.q.length).toBeGreaterThan(0);
      expect(item.a.length).toBeGreaterThan(0);
    }
  });
});

describe("AIRPORT_COPY", () => {
  it("has both locales with working seatsLeft formatter", () => {
    expect(AIRPORT_COPY.en.seatsLeft(3)).toBe("3 seats");
    expect(AIRPORT_COPY.el.seatsLeft(3)).toBe("3 θέσεις");
  });
});

describe("airportHead", () => {
  it("returns fallback head for an unknown code", () => {
    const head = airportHead("zzz");
    expect(head.meta).toEqual([{ title: "Airport — Aloya" }]);
    expect((head as any).links).toBeUndefined();
  });

  it("builds full metadata for a known airport code", () => {
    const head = airportHead("lca");
    const title = head.meta.find((m) => "title" in m) as { title: string };
    expect(title.title).toContain("Larnaca");
    const canonical = head.links.find((l) => l.rel === "canonical");
    expect(canonical?.href).toBe("https://app.aloya.cy/airport/lca");
    expect(head.links).toHaveLength(4);
    expect(head.scripts).toHaveLength(2);
  });

  it("lowercases the code when building the head", () => {
    const head = airportHead("PFO");
    const title = head.meta.find((m) => "title" in m) as { title: string };
    expect(title.title).toContain("Paphos");
  });

  it("embeds valid JSON-LD for airport and FAQ", () => {
    const head = airportHead("lca");
    const airportLd = JSON.parse(head.scripts![0].children);
    expect(airportLd["@type"]).toBe("Airport");
    expect(airportLd.iataCode).toBe("LCA");

    const faqLd = JSON.parse(head.scripts![1].children);
    expect(faqLd["@type"]).toBe("FAQPage");
    expect(faqLd.mainEntity).toHaveLength(3);
    expect(faqLd.mainEntity[0]["@type"]).toBe("Question");
  });
});
