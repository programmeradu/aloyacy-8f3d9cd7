import { describe, expect, it } from "vitest";
import { STOPS } from "./gtfs";
import { buildStopJsonLd, stopHead } from "./stop-seo";

describe("stopHead", () => {
  it("noindexes a thin stop and names it", () => {
    const thin = stopHead("no-such-stop", {
      ratedReliability: false,
      skipSpeaks: false,
      confirmedAttribute: false,
    });
    const robots = thin.meta.find((m) => "name" in m && m.name === "robots");
    expect(robots).toMatchObject({ content: "noindex,follow" });
    expect(thin.meta.find((m) => "title" in m && m.title)?.title).toMatch(/Stop no-such-stop/);
    expect(thin.scripts).toEqual([]);
  });

  it("indexes once a fact exists, and stays closed without facts", () => {
    const open = stopHead("no-such-stop", {
      ratedReliability: true,
      skipSpeaks: false,
      confirmedAttribute: false,
    });
    expect(open.meta.find((m) => "name" in m && m.name === "robots")).toMatchObject({
      content: "index,follow",
    });
    expect(open.scripts).toEqual([]);
    expect(
      stopHead("no-such-stop", undefined).meta.find((m) => "name" in m && m.name === "robots"),
    ).toMatchObject({ content: "noindex,follow" });
  });

  it("embeds BusStop JSON-LD only when the stop is real and indexable", () => {
    const s = STOPS[0];
    expect(s).toBeTruthy();
    const head = stopHead(s.id, {
      ratedReliability: false,
      skipSpeaks: false,
      confirmedAttribute: true,
    });
    expect(head.scripts).toHaveLength(2);
    const parsed = JSON.parse(head.scripts[0].children) as { "@type": string; name: string };
    expect(parsed["@type"]).toBe("BusStop");
    expect(parsed.name).toBe(s.name);
    expect(
      stopHead(s.id, {
        ratedReliability: false,
        skipSpeaks: false,
        confirmedAttribute: false,
      }).scripts,
    ).toEqual([]);
  });
});

describe("buildStopJsonLd", () => {
  it("names a BusStop in Cyprus and nothing we did not measure", () => {
    const graphs = buildStopJsonLd({
      id: "6117",
      name: "Larnaka Airport",
      lat: 34.87,
      lng: 33.6,
      url: "https://app.aloya.cy/stop/6117",
    });
    expect(graphs.map((g) => g["@type"])).toEqual(["BusStop", "BreadcrumbList"]);
    const stop = graphs[0];
    expect(stop["name"]).toBe("Larnaka Airport");
    expect(stop["address"]).toMatchObject({ addressCountry: "CY" });
    expect(JSON.stringify(graphs)).not.toMatch(/shelter|skip|on-time|FAQ/i);
    expect(buildStopJsonLd({ id: "x", name: "", lat: 1, lng: 2, url: "https://x" })).toEqual([]);
  });
});
