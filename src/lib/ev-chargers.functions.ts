// Wave 3 — Live EV charger availability at Park & Ride hubs.
//
// Data source: CyNAP (Cyprus National Access Point) publishes an
// `electric_vehicle_chargers` Datex II dataset. It lists every publicly
// mapped charger on the island with lat/lng, connector power, and (for
// operators that report it) a live "occupied / available / out-of-service"
// status per bay.
//
// Honesty rules mirror `bolt-scooter.functions.ts`:
//   • If the feed is unreachable we return null — never invent counts.
//   • If the feed doesn't carry live status for a station, we only surface
//     the total bay count and never guess how many are free.
//   • Curated `ev` on `park-and-ride.ts` remains the fallback so the UI
//     still says something useful when CyNAP is down.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { distanceM } from "./geo";

const FEED_URL =
  "https://fixcyprus.cy/gnosis/open/api/nap/datasets/electric_vehicle_chargers/";

const CACHE_TTL_MS = 10 * 60_000;
const MATCH_RADIUS_M = 200; // charger within 200 m of a hub centroid counts

export type EvBayStatus = "available" | "occupied" | "unknown" | "offline";

export type EvChargerStation = {
  id: string;
  name: string;
  operator: string | null;
  lat: number;
  lng: number;
  kwMax: number;
  /** Total bays present at this site (from feed capacity). */
  total: number;
  /** Number of bays reported as `available` in the current snapshot, or
   *  null when the operator doesn't publish live status. */
  available: number | null;
  /** Fastest connector kind reported. "dc" = fast, "ac" = slow. */
  kind: "ac" | "dc";
  /** Feed timestamp for this record, unix seconds. Null if not provided. */
  updatedUnix: number | null;
  bays: EvBayStatus[];
};

let cache: { at: number; data: EvChargerStation[] } | null = null;

// Minimal Datex II parser — accepts either the newer `<energyInfrastructure...>`
// block shape or the older `<electricChargingPoint>` shape. Either way we
// pull identifier, coordinates, operator, connector power, and per-bay
// availability strings. Anything we can't confidently extract is skipped.
function parseFeed(xml: string): EvChargerStation[] {
  const out: EvChargerStation[] = [];
  const blocks = xml.split(/<energyInfrastructureSite[\s>]/g).slice(1);
  const rawBlocks =
    blocks.length > 0
      ? blocks.map((b) => b.split("</energyInfrastructureSite>")[0])
      : xml
          .split(/<electricChargingPoint[\s>]/g)
          .slice(1)
          .map((b) => b.split("</electricChargingPoint>")[0]);

  for (const block of rawBlocks) {
    if (!block) continue;

    const idM =
      block.match(/<common:identifier>([^<]+)<\/common:identifier>/) ??
      block.match(/id="([^"]+)"/);
    const nameM =
      block.match(
        /<name>[\s\S]*?<common:value>([^<]+)<\/common:value>/,
      ) ??
      block.match(/<siteName>([^<]+)<\/siteName>/);
    const opM = block.match(
      /<operator>[\s\S]*?<common:value>([^<]+)<\/common:value>/,
    );
    const pointM = block.match(
      /<common:latitude>([\d.+-]+)<\/common:latitude>[\s\S]*?<common:longitude>([\d.+-]+)<\/common:longitude>/,
    );
    if (!idM || !pointM) continue;
    const lat = Number(pointM[1]);
    const lng = Number(pointM[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    // Bay availability — Datex uses `<availabilityStatus>` per bay.
    const statusMatches = Array.from(
      block.matchAll(/<availabilityStatus>([^<]+)<\/availabilityStatus>/g),
    );
    const bays: EvBayStatus[] = statusMatches.map((m) => {
      const v = m[1].trim().toLowerCase();
      if (v.includes("avail")) return "available";
      if (v.includes("occup") || v.includes("inuse") || v.includes("in_use"))
        return "occupied";
      if (v.includes("offline") || v.includes("outofservice"))
        return "offline";
      return "unknown";
    });

    const capM = block.match(/<capacity>(\d+)<\/capacity>/);
    const total = capM ? Number(capM[1]) : bays.length;
    if (!total) continue;

    // Power / connector kind.
    const powerMatches = Array.from(
      block.matchAll(
        /<maximumPowerAtSocket[^>]*>([\d.]+)<\/maximumPowerAtSocket>/g,
      ),
    );
    const kws = powerMatches
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n));
    const kwMax = kws.length > 0 ? Math.max(...kws) : 22;
    const kind: "ac" | "dc" = kwMax >= 43 ? "dc" : "ac";

    const tsM = block.match(
      /<common:timestamp>([^<]+)<\/common:timestamp>/,
    );
    const updatedUnix = tsM
      ? Math.floor(Date.parse(tsM[1]) / 1000) || null
      : null;

    const known = bays.filter((b) => b !== "unknown");
    const available =
      known.length > 0
        ? known.filter((b) => b === "available").length
        : null;

    out.push({
      id: idM[1],
      name: nameM ? nameM[1].trim() : "EV charging",
      operator: opM ? opM[1].trim() : null,
      lat,
      lng,
      kwMax,
      total,
      available,
      kind,
      updatedUnix,
      bays,
    });
  }
  return out;
}

async function loadStations(): Promise<EvChargerStation[] | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  try {
    const res = await fetch(FEED_URL, {
      headers: { accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`cynap ev ${res.status}`);
    const xml = await res.text();
    const data = parseFeed(xml);
    if (data.length === 0) throw new Error("no ev stations parsed");
    cache = { at: Date.now(), data };
    return data;
  } catch {
    // Serve stale cache if we still have any, otherwise null so the UI can
    // fall back to curated data.
    return cache?.data ?? null;
  }
}

const Pt = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
});

/** Public server fn — nearest EV chargers to a point, useful for a future
 *  map overlay or stop-detail panel. Bounded so we never ship the full
 *  island in one payload. */
export const nearestEvChargers = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        near: Pt,
        radiusM: z.number().int().min(50).max(5000).default(1500),
        max: z.number().int().min(1).max(20).default(6),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const stations = await loadStations();
    if (!stations) return { stations: [], live: false };
    const near = stations
      .map((s) => ({ ...s, distanceM: distanceM(data.near, s) }))
      .filter((s) => s.distanceM <= data.radiusM)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, data.max);
    return { stations: near, live: true };
  });

/** Server-internal (no server-fn overhead). Returns the aggregated live EV
 *  snapshot for a hub coordinate, or null when the feed is unreachable /
 *  no charger is registered within `MATCH_RADIUS_M`. */
export async function liveEvForHub(hub: {
  lat: number;
  lng: number;
}): Promise<{
  total: number;
  available: number | null;
  kwMax: number;
  kind: "ac" | "dc";
  operator: string | null;
  updatedUnix: number | null;
} | null> {
  const stations = await loadStations();
  if (!stations) return null;

  const nearby = stations
    .map((s) => ({ s, d: distanceM(hub, s) }))
    .filter((x) => x.d <= MATCH_RADIUS_M)
    .map((x) => x.s);
  if (nearby.length === 0) return null;

  const total = nearby.reduce((n, s) => n + s.total, 0);
  const anyLive = nearby.some((s) => s.available !== null);
  const available = anyLive
    ? nearby.reduce((n, s) => n + (s.available ?? 0), 0)
    : null;
  const kwMax = Math.max(...nearby.map((s) => s.kwMax));
  const kind: "ac" | "dc" = nearby.some((s) => s.kind === "dc")
    ? "dc"
    : "ac";
  const operator = nearby.find((s) => s.operator)?.operator ?? null;
  const updatedUnix = nearby
    .map((s) => s.updatedUnix)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => b - a)[0] ?? null;

  return { total, available, kwMax, kind, operator, updatedUnix };
}
