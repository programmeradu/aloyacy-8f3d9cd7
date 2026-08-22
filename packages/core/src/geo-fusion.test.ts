import { describe, it, expect } from "vitest";
import { GeoFuser, snapPointToPath, type RawFix } from "./geo-fusion";
import type { LatLng } from "./shapes";

const BASE = { lat: 35.1745, lng: 33.3642 }; // Nicosia, Eleftheria Square

function fix(over: Partial<RawFix> = {}): RawFix {
  return {
    lat: BASE.lat,
    lng: BASE.lng,
    accuracyM: 8,
    speedMps: null,
    headingDeg: null,
    timestamp: 1_700_000_000_000,
    ...over,
  };
}

/** Metres between two coordinates (equirectangular — fine at city scale). */
function metresBetween(a: LatLng, b: LatLng): number {
  const dy = (a.lat - b.lat) * 110_540;
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

describe("GeoFuser", () => {
  it("anchors on the first fix and reports it almost verbatim", () => {
    const f = new GeoFuser();
    const out = f.ingest(fix());
    expect(metresBetween(out, BASE)).toBeLessThan(1);
    expect(out.deadReckoned).toBe(false);
    expect(out.snapped).toBe(false);
    expect(out.motion).toBe("still");
  });

  it("smooths a noisy ping instead of teleporting to it", () => {
    const f = new GeoFuser();
    let t = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      t += 1_000;
      f.ingest(fix({ timestamp: t }));
    }
    // A 60 m outlier arrives with poor reported accuracy.
    t += 1_000;
    const out = f.ingest(fix({ lat: BASE.lat + 0.00054, accuracyM: 45, timestamp: t }));
    const jump = metresBetween(out, BASE);
    expect(jump).toBeGreaterThan(0);
    expect(jump).toBeLessThan(60);
  });

  it("trusts a precise ping more than an imprecise one", () => {
    const drift = 0.00027; // ~30 m north
    const run = (accuracyM: number) => {
      const f = new GeoFuser();
      let t = 1_700_000_000_000;
      f.ingest(fix({ timestamp: t }));
      t += 1_000;
      const out = f.ingest(fix({ lat: BASE.lat + drift, accuracyM, timestamp: t }));
      return metresBetween(out, BASE);
    };
    expect(run(5)).toBeGreaterThan(run(60));
  });

  it("classifies motion from the smoothed speed", () => {
    const f = new GeoFuser();
    let t = 1_700_000_000_000;
    f.ingest(fix({ timestamp: t }));
    // ~13 m/s northbound: unambiguously onboard a vehicle.
    let out = f.ingest(fix({ lat: BASE.lat, timestamp: t }));
    for (let i = 1; i <= 8; i++) {
      t += 1_000;
      out = f.ingest(fix({ lat: BASE.lat + i * 0.00012, accuracyM: 5, timestamp: t }));
    }
    expect(out.speedMps).toBeGreaterThan(2.8);
    expect(out.motion).toBe("onboard");
    expect(out.bearingDeg).not.toBeNull();
  });

  it("prefers a reported heading once the rider is actually moving", () => {
    const f = new GeoFuser();
    const t = 1_700_000_000_000;
    f.ingest(fix({ timestamp: t }));
    const out = f.ingest(fix({ timestamp: t + 1_000, speedMps: 6, headingDeg: 275 }));
    expect(out.bearingDeg).toBe(275);
  });

  it("returns null when asked to extrapolate before any fix exists", () => {
    expect(new GeoFuser().extrapolate(Date.now())).toBeNull();
  });

  it("dead-reckons forward while the GPS stream is paused", () => {
    const f = new GeoFuser();
    let t = 1_700_000_000_000;
    f.ingest(fix({ timestamp: t }));
    for (let i = 1; i <= 5; i++) {
      t += 1_000;
      f.ingest(fix({ lat: BASE.lat + i * 0.00012, accuracyM: 5, timestamp: t }));
    }
    const last = f.ingest(fix({ lat: BASE.lat + 0.00072, accuracyM: 5, timestamp: t + 1_000 }));
    const dr = f.extrapolate(t + 4_000)!;
    expect(dr.deadReckoned).toBe(true);
    expect(dr.lat).toBeGreaterThan(last.lat);
    expect(dr.uncertaintyM).toBeGreaterThan(last.uncertaintyM);
  });

  it("stops advancing position once the dead-reckoning budget is spent", () => {
    const f = new GeoFuser();
    let t = 1_700_000_000_000;
    f.ingest(fix({ timestamp: t }));
    for (let i = 1; i <= 4; i++) {
      t += 1_000;
      f.ingest(fix({ lat: BASE.lat + i * 0.00012, accuracyM: 5, timestamp: t }));
    }
    const stale = f.extrapolate(t + 30_000)!;
    const staler = f.extrapolate(t + 60_000)!;
    expect(stale.deadReckoned).toBe(true);
    expect(metresBetween(staler, stale)).toBeLessThan(1);
  });

  it("snaps onto the active path when cross-track error is small", () => {
    const path: LatLng[] = [
      { lat: BASE.lat, lng: BASE.lng },
      { lat: BASE.lat, lng: BASE.lng + 0.01 },
    ];
    const f = new GeoFuser();
    const t = 1_700_000_000_000;
    // ~11 m north of an east-west line.
    const out = f.ingest(
      fix({ lat: BASE.lat + 0.0001, lng: BASE.lng + 0.002, accuracyM: 5, timestamp: t }),
      path,
    );
    expect(out.snapped).toBe(true);
    expect(Math.abs(out.lat - BASE.lat)).toBeLessThan(0.0001);
  });

  it("does not snap a rider who is genuinely off-route", () => {
    const path: LatLng[] = [
      { lat: BASE.lat, lng: BASE.lng },
      { lat: BASE.lat, lng: BASE.lng + 0.01 },
    ];
    const f = new GeoFuser();
    const out = f.ingest(
      // ~330 m north of the line.
      fix({ lat: BASE.lat + 0.003, lng: BASE.lng + 0.002, timestamp: 1_700_000_000_000 }),
      path,
    );
    expect(out.snapped).toBe(false);
  });

  it("ignores a degenerate path", () => {
    const f = new GeoFuser();
    const out = f.ingest(fix(), [{ lat: BASE.lat, lng: BASE.lng }]);
    expect(out.snapped).toBe(false);
  });
});

describe("snapPointToPath", () => {
  it("returns null for a path that has no segment", () => {
    expect(snapPointToPath(BASE, [])).toBeNull();
    expect(snapPointToPath(BASE, [BASE])).toBeNull();
  });

  it("projects onto the nearest segment and reports cross-track metres", () => {
    const path: LatLng[] = [
      { lat: BASE.lat, lng: BASE.lng },
      { lat: BASE.lat, lng: BASE.lng + 0.01 },
    ];
    const snap = snapPointToPath({ lat: BASE.lat + 0.0002, lng: BASE.lng + 0.005 }, path)!;
    expect(snap.crossM).toBeGreaterThan(15);
    expect(snap.crossM).toBeLessThan(30);
    expect(snap.lat).toBeCloseTo(BASE.lat, 5);
    expect(snap.lng).toBeCloseTo(BASE.lng + 0.005, 5);
  });

  it("clamps to a segment endpoint when the point is past the end", () => {
    const path: LatLng[] = [
      { lat: BASE.lat, lng: BASE.lng },
      { lat: BASE.lat, lng: BASE.lng + 0.001 },
    ];
    const snap = snapPointToPath({ lat: BASE.lat, lng: BASE.lng + 0.005 }, path)!;
    expect(snap.lng).toBeCloseTo(BASE.lng + 0.001, 6);
  });

  it("skips zero-length segments without dividing by zero", () => {
    const dup = { lat: BASE.lat, lng: BASE.lng };
    const snap = snapPointToPath({ lat: BASE.lat + 0.0001, lng: BASE.lng }, [
      dup,
      dup,
      { lat: BASE.lat, lng: BASE.lng + 0.001 },
    ])!;
    expect(Number.isFinite(snap.crossM)).toBe(true);
  });
});
