import { describe, expect, it } from "vitest";
import { archiveSelectUrl, deleteUrls } from "./archive";

const BASE = "https://db.example/rest/v1";

describe("archiveSelectUrl", () => {
  it("orders by time then composite key so paging is deterministic", () => {
    const url = archiveSelectUrl("https://db.example/", "rt_snapshots", "captured_at", "2026-08-28T00:00:00.000Z", 5000);
    expect(url).toContain("captured_at=lt.2026-08-28T00%3A00%3A00.000Z");
    expect(url).toContain("order=captured_at.asc%2Ctrip_id.asc%2Cstop_id.asc");
    expect(url).toContain("limit=5000");
  });
});

describe("deleteUrls", () => {
  it("chunks id deletes so the URL stays short", () => {
    const rows = Array.from({ length: 401 }, (_, i) => ({ id: i + 1, trip_id: "t" }));
    const urls = deleteUrls("https://db.example", "rt_snapshots", rows);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("id=in.(1,2,3");
    expect(urls[2]).toMatch(/id=in\.\(401\)/);
  });

  it("falls back to trip_id+stop_id when there is no id column", () => {
    const rows = [
      { trip_id: "a", stop_id: "s1" },
      { trip_id: "b", stop_id: "s2" },
    ];
    const urls = deleteUrls("https://db.example", "observed_arrivals", rows);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("or=(and(trip_id.eq.\"a\",stop_id.eq.\"s1\")");
    expect(urls[0]).not.toContain("id=in.");
  });

  it("does not emit a catch-all time-column delete", () => {
    const urls = deleteUrls("https://db.example", "observed_arrivals", [{ trip_id: "t", stop_id: "s" }]);
    expect(urls.join(" ")).not.toMatch(/last_seen_at=lt/);
  });
});
