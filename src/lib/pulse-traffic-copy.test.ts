import { describe, expect, it } from "vitest";
import {
  categoryToKind,
  friendlyTrafficHeadline,
  friendlyTrafficLine,
  localizeCity,
  localizedPlace,
  parseStructured,
  specificFromFeed,
  tidyRoad,
  zoneLabel,
} from "./pulse-traffic-copy";

describe("tidyRoad", () => {
  it("returns null for empty input", () => {
    expect(tidyRoad(null)).toBeNull();
    expect(tidyRoad("   ")).toBeNull();
  });

  it("strips road-type prefixes in both languages", () => {
    expect(tidyRoad("Avenue Makariou")).toBe("Makariou");
    expect(tidyRoad("Λεωφόρος Μακαρίου")).toBe("Μακαρίου");
  });

  it("collapses whitespace", () => {
    expect(tidyRoad("  A1   motorway ")).toBe("A1 motorway");
  });
});

describe("zoneLabel", () => {
  it("returns null for unknown or missing zones", () => {
    expect(zoneLabel(null, false)).toBeNull();
    expect(zoneLabel("atlantis", false)).toBeNull();
  });

  it("returns the localized label for a known zone", () => {
    const en = zoneLabel("nicosia", false);
    const el = zoneLabel("nicosia", true);
    expect(en).toBe("Nicosia");
    expect(el).toBeTruthy();
    expect(el).not.toBe(en);
  });
});

describe("localizedPlace", () => {
  it("prefers a Cyprus road code, locale-agnostic", () => {
    expect(localizedPlace("A1 motorway", "nicosia", "Nicosia", false)).toEqual({
      kind: "road",
      label: "A1",
    });
    expect(localizedPlace("Λεωφόρος B8", "nicosia", "Λευκωσία", true)).toEqual({
      kind: "road",
      label: "B8",
    });
  });

  it("keeps a road name only when the script matches the locale", () => {
    expect(localizedPlace("Makariou", null, "Nicosia", false)).toEqual({
      kind: "road",
      label: "Makariou",
    });
    expect(localizedPlace("Μακαρίου", null, "Λευκωσία", true)).toEqual({
      kind: "road",
      label: "Μακαρίου",
    });
  });

  it("transliterates a known place when the script is wrong for the locale", () => {
    expect(localizedPlace("Λεμεσού", null, "Nicosia", false)).toEqual({
      kind: "near",
      label: "Limassol",
    });
  });

  it("falls back to the zone, then the focus city", () => {
    expect(localizedPlace("Μακαρίου", "nicosia", "Larnaca", false)).toEqual({
      kind: "near",
      label: "Nicosia",
    });
    expect(localizedPlace(null, null, "Larnaca", false)).toEqual({
      kind: "near",
      label: "Larnaca",
    });
  });
});

describe("friendlyTrafficHeadline", () => {
  it("writes English copy for every kind", () => {
    expect(friendlyTrafficHeadline("roadworks", "A1", null, "Nicosia", false)).toBe(
      "Roadworks on the A1",
    );
    expect(friendlyTrafficHeadline("closure", "A1", null, "Nicosia", false)).toBe(
      "Road closed on the A1",
    );
    expect(friendlyTrafficHeadline("accident", null, null, "Nicosia", false)).toBe(
      "Crash reported near Nicosia",
    );
    expect(friendlyTrafficHeadline("congestion", null, null, "Nicosia", false)).toBe(
      "Heavy traffic near Nicosia",
    );
    expect(friendlyTrafficHeadline("weather", null, null, "Nicosia", false)).toBe(
      "Weather-related delay near Nicosia",
    );
    expect(friendlyTrafficHeadline("other", null, null, "Nicosia", false)).toBe(
      "Incident near Nicosia",
    );
  });

  it("writes Greek copy with the right preposition", () => {
    expect(friendlyTrafficHeadline("roadworks", "A1", null, "Λευκωσία", true)).toBe(
      "Έργα οδοποιίας στον A1",
    );
    expect(friendlyTrafficHeadline("closure", null, null, "Λευκωσία", true)).toContain(
      "κοντά στη Λευκωσία",
    );
  });
});

describe("friendlyTrafficLine", () => {
  it("summarises kind and place in English", () => {
    expect(friendlyTrafficLine("congestion", "A1", null, "Nicosia", false)).toBe(
      "Heavy traffic · A1",
    );
    expect(friendlyTrafficLine("other", null, null, "Nicosia", false)).toBe("Incident · Nicosia");
  });

  it("summarises kind and place in Greek", () => {
    expect(friendlyTrafficLine("accident", "B8", null, "Λευκωσία", true)).toBe("Ατύχημα · B8");
    expect(friendlyTrafficLine("weather", null, null, "Λευκωσία", true)).toBe("Καιρός · Λευκωσία");
  });
});

describe("localizeCity", () => {
  it("maps transliterations both ways", () => {
    expect(localizeCity("Lefkosia", false)).toBe("Nicosia");
    expect(localizeCity("lefkosia", true)).toBe("Λευκωσία");
  });

  it("passes unknown cities through trimmed", () => {
    expect(localizeCity("  Kakopetria ", false)).toBe("Kakopetria");
  });
});

describe("categoryToKind", () => {
  it("classifies DATEX categories", () => {
    expect(categoryToKind("ROAD_CLOSED.NO_SUBTYPE")).toBe("closure");
    expect(categoryToKind("CONSTRUCTION_WORKS")).toBe("roadworks");
    expect(categoryToKind("ACCIDENT.MULTI_VEHICLE")).toBe("accident");
    expect(categoryToKind("TRAFFIC_JAM")).toBe("congestion");
    // "HEAVY" is matched before the weather bucket, so this is congestion.
    expect(categoryToKind("HEAVY_RAIN")).toBe("congestion");
    expect(categoryToKind("FOG")).toBe("weather");
    expect(categoryToKind("SOMETHING_ELSE")).toBe("other");
  });
});

describe("parseStructured", () => {
  it("returns null for non-structured input", () => {
    expect(parseStructured(null, false)).toBeNull();
    expect(parseStructured("Roadworks on the A1", false)).toBeNull();
  });

  it("turns a structured row into English copy", () => {
    const out = parseStructured(
      "City:Strovolos, Street:Agias Marinas, Category:ROAD_CLOSED.NO_SUBTYPE",
      false,
    )!;
    expect(out.kind).toBe("closure");
    expect(out.headline).toBe("Road closed on Agias Marinas, Strovolos");
    expect(out.line).toBe("Closed · Agias Marinas, Strovolos");
  });

  it("turns a structured row into Greek copy", () => {
    const out = parseStructured(
      "City:Lemesos, Street:Anexartisias, Category:CONSTRUCTION_WORKS",
      true,
    )!;
    expect(out.kind).toBe("roadworks");
    expect(out.headline).toContain("Έργα οδοποιίας στην Anexartisias, Λεμεσός");
    expect(out.line).toBe("Έργα · Anexartisias, Λεμεσός");
  });
});

describe("specificFromFeed", () => {
  it("rejects empty, short and generic feed text", () => {
    expect(specificFromFeed(null, false)).toBeNull();
    expect(specificFromFeed("Crash", false)).toBeNull();
    expect(specificFromFeed("Traffic event reported", false)).toBeNull();
  });

  it("rejects structured machine rows", () => {
    expect(
      specificFromFeed("City:Strovolos, Street:Agias Marinas, Category:ROAD_CLOSED", false),
    ).toBeNull();
    expect(specificFromFeed("Street: some road detail here", false)).toBeNull();
  });

  it("rejects text written in the other locale's script", () => {
    expect(specificFromFeed("Κλειστός δρόμος λόγω έργων", false)).toBeNull();
    expect(specificFromFeed("Lane closed for resurfacing works", true)).toBeNull();
  });

  it("keeps script-matching detail and normalises whitespace", () => {
    expect(specificFromFeed("  Lane   closed for resurfacing works ", false)).toBe(
      "Lane closed for resurfacing works",
    );
  });

  it("accepts either script when a road code is present", () => {
    expect(specificFromFeed("A1 closed between junctions", true)).toBe(
      "A1 closed between junctions",
    );
  });

  it("truncates very long feed text with an ellipsis", () => {
    const long = "Lane closure " + "x".repeat(300);
    const out = specificFromFeed(long, false)!;
    expect(out.length).toBeLessThanOrEqual(158);
    expect(out.endsWith("…")).toBe(true);
  });
});
