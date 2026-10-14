import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import polyline from "@mapbox/polyline";
import {
  drivingRoute,
  placesAutocomplete,
  resolvePlace,
  reverseGeocode,
  toManeuverKey,
  walkingDirections,
  walkingRoute,
} from "../maps.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("maps.server (Mapbox)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = "pk.test";
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.MAPBOX_BACKUP_TOKEN;
  });

  it("autocomplete returns POIs from Search Box and resolves them without a second call", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        features: [
          {
            properties: {
              mapbox_id: "abc",
              feature_type: "poi",
              name: "University of Cyprus",
              place_formatted: "2109 Aglantzia, Cyprus",
              coordinates: { latitude: 35.144, longitude: 33.381 },
            },
          },
        ],
      }),
    );
    const out = await placesAutocomplete("University of Cyprus", { lat: 35.17, lng: 33.36 });
    expect(fetchMock.mock.calls[0][0]).toContain("/search/searchbox/v1/forward");
    expect(fetchMock.mock.calls[0][0]).toContain("country=cy");
    expect(out[0].primary).toBe("University of Cyprus");
    const place = await resolvePlace(out[0].placeId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(place.lat).toBeCloseTo(35.144);
    expect(place.lng).toBeCloseTo(33.381);
  });

  it("falls back to geocoding when Search Box has nothing", async () => {
    fetchMock.mockResolvedValueOnce(json({ features: [] })).mockResolvedValueOnce(
      json({
        features: [
          {
            properties: {
              name: "Makariou Avenue",
              place_formatted: "Nicosia",
              coordinates: { latitude: 35.16, longitude: 33.36 },
            },
          },
        ],
      }),
    );
    const out = await placesAutocomplete("Makariou");
    expect(fetchMock.mock.calls[1][0]).toContain("/search/geocode/v6/forward");
    expect(out[0].primary).toBe("Makariou Avenue");
  });

  it("retries with the backup token on 401", async () => {
    process.env.MAPBOX_BACKUP_TOKEN = "pk.backup";
    fetchMock
      .mockResolvedValueOnce(json({ message: "Not Authorized" }, 401))
      .mockResolvedValueOnce(json({ features: [{ properties: { full_address: "1 Odos, Nicosia" } }] }));
    expect(await reverseGeocode(35.17, 33.36)).toBe("1 Odos, Nicosia");
    expect(fetchMock.mock.calls[1][0]).toContain("access_token=pk.backup");
  });

  it("walkingRoute maps duration, distance and geometry", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ code: "Ok", routes: [{ duration: 301.4, distance: 402.6, geometry: "abc", legs: [] }] }),
    );
    const r = await walkingRoute({ lat: 35.17, lng: 33.36 }, { lat: 35.168, lng: 33.365 });
    expect(r).toEqual({ durationSec: 301, distanceMeters: 403, polyline: "abc" });
    expect(fetchMock.mock.calls[0][0]).toContain("/directions/v5/mapbox/walking/33.360000,35.170000;");
  });

  it("walkingDirections maps steps and maneuvers", async () => {
    const geom = polyline.encode([
      [35.17, 33.36],
      [35.171, 33.361],
    ]);
    fetchMock.mockResolvedValueOnce(
      json({
        code: "Ok",
        routes: [
          {
            duration: 60,
            distance: 120,
            geometry: geom,
            legs: [
              {
                steps: [
                  {
                    distance: 120,
                    duration: 60,
                    geometry: geom,
                    maneuver: { type: "turn", modifier: "left", instruction: "Turn left", location: [33.36, 35.17] },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const d = await walkingDirections({ lat: 35.17, lng: 33.36 }, { lat: 35.171, lng: 33.361 }, "el");
    expect(fetchMock.mock.calls[0][0]).toContain("language=el");
    expect(d?.steps[0].maneuver).toBe("TURN_LEFT");
    expect(d?.steps[0].end.lat).toBeCloseTo(35.171);
  });

  it("drivingRoute uses driving-traffic with typical duration as the baseline", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ code: "Ok", routes: [{ duration: 900, duration_typical: 780, distance: 8000, geometry: "", legs: [] }] }),
    );
    const r = await drivingRoute({ lat: 35.1, lng: 33.3 }, { lat: 35.17, lng: 33.36 });
    expect(fetchMock.mock.calls[0][0]).toContain("/mapbox/driving-traffic/");
    expect(r).toEqual({ durationSec: 900, staticDurationSec: 780, distanceMeters: 8000 });
  });

  it("returns null when no route exists", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "NoRoute", routes: [] }));
    expect(await walkingRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).toBeNull();
  });

  it("maps Mapbox maneuvers onto the translated keys", () => {
    expect(toManeuverKey("depart")).toBe("DEPART");
    expect(toManeuverKey("arrive")).toBe("ARRIVE");
    expect(toManeuverKey("turn", "slight right")).toBe("TURN_SLIGHT_RIGHT");
    expect(toManeuverKey("fork", "left")).toBe("FORK_LEFT");
    expect(toManeuverKey("roundabout", "right")).toBe("ROUNDABOUT_RIGHT");
    expect(toManeuverKey("continue", "straight")).toBe("STRAIGHT");
  });
});
