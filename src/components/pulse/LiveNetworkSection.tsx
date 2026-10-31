// Live network: the island map with every tracked bus grouped by area (count
// bubbles, so 226 buses read as 226 and not two stray icons), plus the live bus
// count and the on-time share. Numbers come from useNetworkNow, the same source
// as the Network now card.
import { useMemo } from "react";
import { MapPreview } from "@/components/MapPreview";
import type { DomPin } from "@/components/map/useDomPins";
import type { MapMarker } from "@/components/map/types";
import type { LiveVehicle } from "@/lib/gtfs-rt.server";
import type { NetworkNow } from "@/lib/network-now";
import { useRoamI18n } from "@/lib/roam-i18n";
import { VehicleImg } from "@/components/roam/bits";

const CYPRUS_CENTER = { lat: 34.92, lng: 33.18 };
// Where the buses run (Polis to Protaras, Paphos to Nicosia). Fixed, so the map
// does not refit on every 20 s refresh.
const ISLAND_BOUNDS: MapMarker[] = [
  { lat: 34.62, lng: 32.3, kind: "bounds" },
  { lat: 35.22, lng: 34.06, kind: "bounds" },
];

type Cluster = { lat: number; lng: number; n: number; sl: number; sg: number };

function clusterVehicles(vs: LiveVehicle[]): Cluster[] {
  const out: Cluster[] = [];
  for (const v of vs) {
    let hit: Cluster | null = null;
    for (const c of out) {
      if (Math.abs(c.lat - v.lat) < 0.14 && Math.abs(c.lng - v.lng) < 0.2) {
        hit = c;
        break;
      }
    }
    if (hit) {
      hit.n++;
      hit.sl += v.lat;
      hit.sg += v.lng;
      hit.lat = hit.sl / hit.n;
      hit.lng = hit.sg / hit.n;
    } else {
      out.push({ lat: v.lat, lng: v.lng, n: 1, sl: v.lat, sg: v.lng });
    }
  }
  return mergeOverlaps(out).sort((a, b) => b.n - a.n);
}

// Rough screen scale of the fixed island view (about 200 px per degree of
// longitude on a phone, latitude stretched by Mercator at 35 N). Good enough to
// keep bubbles apart without reading the live map.
const PX_PER_LNG = 196;
const PX_PER_LAT = 240;
const bubble = (n: number) => (n === 1 ? 14 : n >= 10 ? 50 : 34);

/**
 * Merge any two clusters whose bubbles would touch, until none do. No bubble is
 * ever hidden for overlapping (the map does not declutter these pins), so the
 * numbers on the map always add up to the live count.
 */
function mergeOverlaps(list: Cluster[]): Cluster[] {
  const cs = list.map((c) => ({ ...c }));
  for (;;) {
    let bi = -1;
    let bj = -1;
    let worst = 0;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const dx = (cs[i].lng - cs[j].lng) * PX_PER_LNG;
        const dy = (cs[i].lat - cs[j].lat) * PX_PER_LAT;
        const need = (bubble(cs[i].n) + bubble(cs[j].n)) / 2 + 6;
        const over = need - Math.hypot(dx, dy);
        if (over > worst) {
          worst = over;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0) return cs;
    const a = cs[bi];
    const b = cs[bj];
    const n = a.n + b.n;
    const sl = a.sl + b.sl;
    const sg = a.sg + b.sg;
    cs[bi] = { n, sl, sg, lat: sl / n, lng: sg / n };
    cs.splice(bj, 1);
  }
}

function MiniRing({ pct }: { pct: number }) {
  const R = 15;
  const C = 2 * Math.PI * R;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <svg className="r-mini-ring" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={R} fill="none" stroke="#EEEEEA" strokeWidth="5" />
      <circle
        cx="20"
        cy="20"
        r={R}
        fill="none"
        stroke="#F6B83C"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * C} ${C}`}
        transform="rotate(-90 20 20)"
      />
    </svg>
  );
}

export function LiveNetworkSection({
  now,
  vehicles,
}: {
  now: NetworkNow | null;
  vehicles: LiveVehicle[];
}) {
  const { r } = useRoamI18n();
  const live = now?.liveBuses ?? 0;
  const rated = !!now && now.tracked > 0;
  // Same list as the count: the bubbles always add up to the live figure.
  const onMap = vehicles.length;
  const clustered = useMemo(() => clusterVehicles(vehicles), [vehicles]);
  const pins = useMemo<DomPin[]>(
    () =>
      clustered.map((c, i) => ({
        id: `clu-${i}`,
        lat: c.lat,
        lng: c.lng,
        anchor: "center" as const,
        priority: c.n,
        node:
          c.n === 1 ? (
            <span className="r-clu r-clu--one" aria-hidden="true" />
          ) : (
            <span className={`r-clu${c.n >= 10 ? " r-clu--lg" : ""}`}>{c.n}</span>
          ),
      })),
    [clustered],
  );

  return (
    <section className="animate-rise" style={{ animationDelay: "100ms" }}>
      <h2 className="r-pulse-h">
        <span>{r("pulse.live.title")}</span>
        {live ? <small data-metric="map-head-live">{r("pulse.nn.live", { n: live })}</small> : null}
      </h2>
      <MapPreview
        height="h-56"
        center={CYPRUS_CENTER}
        spanKm={160}
        markers={ISLAND_BOUNDS}
        fitToContent
        liveVehicles={false}
        hideLiveBadge
        pins={pins}
        declutterPx={0}
      />
      <span hidden data-metric="map-sum">
        {clustered.reduce((t, c) => t + c.n, 0)}/{onMap}
      </span>
      <div className="r-pulse-tiles">
        <div className="r-pulse-tile">
          <p>{r("pulse.live.buses")}</p>
          <strong data-metric="tile-live">{live || "-"}</strong>
          <VehicleImg kind="bus" width={96} className="r-pulse-tilebus" />
        </div>
        <div className="r-pulse-tile">
          <p>{r("pulse.live.onTime")}</p>
          <strong data-metric="tile-ontime">{rated ? `${now!.onTimePct}%` : "-"}</strong>
          {rated ? (
            <p className="r-pulse-tilesub">{r("pulse.live.delayedN", { n: now!.late })}</p>
          ) : null}
          <MiniRing pct={rated ? now!.onTimePct : 0} />
        </div>
      </div>
    </section>
  );
}
