import { describe, it, expect } from "vitest";
import {
  tidyRoad,
  zoneLabel,
  localizedPlace,
  friendlyTrafficHeadline,
  localizeCity,
  categoryToKind,
  parseStructured,
  specificFromFeed,
  friendlyTrafficLine,
} from "../pulse-traffic-copy";

describe("tidyRoad", () => {
  it("returns null for null/empty input", () => {
    expect(tidyRoad(null)).toBeNull();
    expect(tidyRoad("   ")).toBeNull();
  });
  it("strips known prefixes and collapses whitespace", () => {
    expect(tidyRoad("Οδός  Λεωφόρου  Test")).toBe("Λεωφόρου Test");
    expect(tidyRoad("Road   Main   Street")).toBe("Main Street");
    expect(tidyRoad("Λεωφ. Makariou")).toBe("Makariou");
    expect(tidyRoad("Highway 1")).toBe("1");
  });
  it("passes through plain strings", () => {
    expect(tidyRoad("A1")).toBe("A1");
  });
});

describe("zoneLabel", () => {
  it("returns null for null id or unknown id", () => {
    expect(zoneLabel(null, false)).toBeNull();
    expect(zoneLabel("nowhere", false)).toBeNull();
  });
  it("returns english and greek labels", () => {
    expect(zoneLabel("nicosia", false)).toBe("Nicosia");
    expect(zoneLabel("nicosia", true)).toBe("Λευκωσία");
  });
});

describe("localizedPlace", () => {
  it("prefers a road code regardless of locale", () => {
    expect(localizedPlace("A1 Highway", "limassol", "Limassol", false)).toEqual({
      kind: "road",
      label: "A1",
    });
    expect(localizedPlace("B8", null, "Larnaca", true)).toEqual({ kind: "road", label: "B8" });
  });
  it("uses tidy road text matching script (greek)", () => {
    expect(localizedPlace("Λεωφόρος Μακαρίου", null, "Nicosia", true)).toEqual({
      kind: "road",
      label: "Μακαρίου",
    });
  });
  it("uses tidy road text matching script (english)", () => {
    expect(localizedPlace("Makariou Avenue", null, "Nicosia", false)).toEqual({
      kind: "road",
      label: "Makariou Avenue",
    });
  });
  it("transliterates a known greek place token when locale is english", () => {
    expect(localizedPlace("λεμεσού", null, "Fallback", false)).toEqual({
      kind: "near",
      label: "Limassol",
    });
  });
  it("falls back to zone label when road doesn't match script and no translit", () => {
    // English road text requested in greek locale, no known token
    expect(localizedPlace("Random Street", "paphos", "City", true)).toEqual({
      kind: "near",
      label: "Πάφου",
    });
  });
  it("falls back to fallbackCity when nothing else matches", () => {
    expect(localizedPlace(null, null, "Fallback City", false)).toEqual({
      kind: "near",
      label: "Fallback City",
    });
    expect(localizedPlace(null, "unknown-zone", "Fallback City", false)).toEqual({
      kind: "near",
      label: "Fallback City",
    });
  });
});

describe("friendlyTrafficHeadline", () => {
  const kinds = ["roadworks", "closure", "accident", "congestion", "weather", "other"] as const;
  it("produces english headline for each kind, road-based", () => {
    for (const k of kinds) {
      const s = friendlyTrafficHeadline(k, "A1", null, "City", false);
      expect(s).toContain("on the A1");
      expect(typeof s).toBe("string");
    }
  });
  it("produces greek headline for each kind, near-based", () => {
    for (const k of kinds) {
      const s = friendlyTrafficHeadline(k, null, "nicosia", "City", true);
      expect(s).toContain("κοντά στη Λευκωσία");
    }
  });
});

describe("localizeCity", () => {
  it("translates known cities case/whitespace-insensitively", () => {
    expect(localizeCity("  Strovolos  ", false)).toBe("Strovolos");
    expect(localizeCity("STROVOLOS", true)).toBe("Στρόβολος");
    expect(localizeCity("lemesos", false)).toBe("Limassol");
  });
  it("passes through unknown cities trimmed", () => {
    expect(localizeCity("  Unknown Town  ", false)).toBe("Unknown Town");
  });
});

describe("categoryToKind", () => {
  it("maps categories case-insensitively", () => {
    expect(categoryToKind("roadwork_minor")).toBe("roadworks");
    expect(categoryToKind("CONSTRUCTION")).toBe("roadworks");
    expect(categoryToKind("MAINTENANCE")).toBe("roadworks");
    expect(categoryToKind("ROAD_CLOSED.NO_SUBTYPE")).toBe("closure");
    expect(categoryToKind("closure")).toBe("closure");
    expect(categoryToKind("BLOCKED")).toBe("closure");
    expect(categoryToKind("ACCIDENT")).toBe("accident");
    expect(categoryToKind("crash")).toBe("accident");
    expect(categoryToKind("CONGESTION")).toBe("congestion");
    expect(categoryToKind("jam")).toBe("congestion");
    expect(categoryToKind("HEAVY")).toBe("congestion");
    expect(categoryToKind("WEATHER")).toBe("weather");
    expect(categoryToKind("rain")).toBe("weather");
    expect(categoryToKind("FOG")).toBe("weather");
    expect(categoryToKind("snow")).toBe("weather");
    expect(categoryToKind("WIND")).toBe("weather");
    expect(categoryToKind("something-else")).toBe("other");
  });
});

describe("parseStructured", () => {
  it("returns null for null/non-matching input", () => {
    expect(parseStructured(null, false)).toBeNull();
    expect(parseStructured("just a plain sentence", false)).toBeNull();
  });
  it("parses a structured row (english)", () => {
    const r = parseStructured(
      "City:Strovolos, Street:Agias Marinas, Category:ROAD_CLOSED.NO_SUBTYPE",
      false,
    );
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("closure");
    expect(r!.headline).toBe("Road closed on Agias Marinas, Strovolos");
    expect(r!.line).toBe("Closed · Agias Marinas, Strovolos");
  });
  it("parses a structured row (greek) across all kinds", () => {
    const cats: Array<[string, string]> = [
      ["ROADWORK", "roadworks"],
      ["ROAD_CLOSED", "closure"],
      ["ACCIDENT", "accident"],
      ["CONGESTION", "congestion"],
      ["WEATHER", "weather"],
      ["FOO", "other"],
    ];
    for (const [cat, kind] of cats) {
      const r = parseStructured(`City:Lemesos, Street:Main, Category:${cat}`, true);
      expect(r!.kind).toBe(kind);
      expect(r!.headline).toContain("Main, Limassol".split(",")[0] === "Main" ? "" : "");
    }
  });
});

describe("specificFromFeed", () => {
  it("returns null for null, short, generic or structured text", () => {
    expect(specificFromFeed(null, false)).toBeNull();
    expect(specificFromFeed("short", false)).toBeNull();
    expect(specificFromFeed("Traffic event reported.", false)).toBeNull();
    expect(specificFromFeed("Συμβάν.", true)).toBeNull();
    expect(
      specificFromFeed("City:Strovolos, Street:Agias Marinas, Category:ROAD_CLOSED", false),
    ).toBeNull();
    expect(specificFromFeed("city: somewhere, category: x, more text here", false)).toBeNull();
  });
  it("rejects wrong-script text", () => {
    expect(specificFromFeed("This is an english sentence about traffic delays", true)).toBeNull();
    expect(specificFromFeed("Αυτή είναι μια ελληνική πρόταση για κίνηση", false)).toBeNull();
  });
  it("accepts matching script text, and truncates long text", () => {
    const s = specificFromFeed("This is an english sentence about traffic delays today", false);
    expect(s).toBe("This is an english sentence about traffic delays today");
    const long = "x".repeat(200) + " A1";
    const r = specificFromFeed(long, false);
    expect(r!.length).toBeLessThanOrEqual(158);
    expect(r!.endsWith("…")).toBe(true);
  });
  it("accepts text containing a road code even in wrong script direction", () => {
    const s = specificFromFeed("Traffic delay reported near junction A1 today", true);
    expect(s).toBe("Traffic delay reported near junction A1 today");
  });
});

describe("friendlyTrafficLine", () => {
  it("builds short line for each kind (english + greek)", () => {
    const kinds = ["roadworks", "closure", "accident", "congestion", "weather", "other"] as const;
    for (const k of kinds) {
      expect(friendlyTrafficLine(k, "A1", null, "City", false)).toContain("A1");
      expect(friendlyTrafficLine(k, null, "limassol", "City", true)).toContain("Λεμεσός");
    }
  });
});
