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
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || (v.lat === 0 && v.lng === 0)) continue;
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
  return out.sort((a, b) => b.n - a.n);
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
  const pins = useMemo<DomPin[]>(
    () =>
      clusterVehicles(vehicles).map((c, i) => ({
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
    [vehicles],
  );
  const live = now?.liveBuses ?? 0;
  const rated = !!now && now.tracked > 0;

  return (
    <section className="animate-rise" style={{ animationDelay: "100ms" }}>
      <h2 className="r-pulse-h">
        <span>{r("pulse.live.title")}</span>
        {live ? <small>{r("pulse.nn.live", { n: live })}</small> : null}
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
        declutterPx={30}
      />
      <div className="r-pulse-tiles">
        <div className="r-pulse-tile">
          <p>{r("pulse.live.buses")}</p>
          <strong>{live || "-"}</strong>
          <VehicleImg kind="bus" width={104} className="r-pulse-tilebus" />
        </div>
        <div className="r-pulse-tile">
          <p>{r("pulse.live.onTime")}</p>
          <strong>{rated ? `${now!.onTimePct}%` : "-"}</strong>
          {rated ? <p className="r-pulse-tilesub">{r("pulse.live.delayedN", { n: now!.late })}</p> : null}
          <MiniRing pct={rated ? now!.onTimePct : 0} />
        </div>
      </div>
    </section>
  );
}
