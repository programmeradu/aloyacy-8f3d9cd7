// Now (home, `/`) in the Roam design: the real neighbourhood from above,
// stop pins with buses-due badges, the floating stop card, saved places, and
// below the fold everything that used to live on Saved and the old home.
// Data: the same hooks as the Sky home (useNextBus, useNearbyStops), unchanged.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPreview } from "@/components/MapPreview";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ResumeTripPill } from "@/components/ResumeTripPill";
import { PasskeyEnrollPrompt } from "@/components/PasskeyEnrollPrompt";
import { SkySearchSheet } from "@/components/home/SkySearchSheet";
import { useNextBus } from "@/components/home/useNextBus";
import { useNearbyStops } from "@/components/home/useNearbyStops";
import { deriveCardState } from "@/components/home/sky-state";
import { useGeolocation } from "@/lib/useGeolocation";
import { distanceKm, getStop, nearestStops } from "@/lib/gtfs";
import { useActiveTrip, useSavedPlaces } from "@/lib/trip-store";
import { useTick } from "@/hooks/use-tick";
import { useRoamI18n } from "@/lib/roam-i18n";
import { TabBar } from "../TabBar";
import { FrostButton } from "../FrostButton";
import { AvatarButton } from "../Avatar";
import { Icon } from "../Icon";
import { NowCard } from "./NowCard";
import { NowMore } from "./NowMore";
import { useLocationControl } from "./useLocationControl";

const PICK_KEY = "aloya:home-stop";
/** Attribution sits under the header chips, clear of the card and tab bar. */
const NOW_ATTRIB_TOP = "calc(var(--r-safe-top) + 128px)";
/** Larnaca International Airport (LCA), public coordinates. */
const LCA = { lat: 34.8751, lng: 33.6249, label: "Larnaca Airport" };

function placeHref(p: { lat: number; lng: number; label: string }) {
  return `/trips?toLat=${p.lat}&toLng=${p.lng}&toLabel=${encodeURIComponent(p.label)}`;
}

export function RoamNow() {
  const { r, locale } = useRoamI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useTick(30_000);
  const geoHook = useGeolocation();
  const loc = useLocationControl(geoHook.coords, geoHook.source);
  const coords = loc.coords;
  const located = loc.source !== "fallback";

  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    try {
      setPicked(localStorage.getItem(PICK_KEY));
    } catch {}
  }, []);
  const pickStop = useCallback((id: string | null) => {
    setPicked(id);
    try {
      if (id) localStorage.setItem(PICK_KEY, id);
      else localStorage.removeItem(PICK_KEY);
    } catch {}
  }, []);
  /** A pin tapped on the map focuses that stop for this visit only. */
  const [focus, setFocus] = useState<string | null>(null);

  const nb = useNextBus({ coords, located, pickedStopId: focus ?? picked });
  const stops = useNearbyStops(coords, 5);
  const state = deriveCardState({
    mounted,
    hasPickedStop: !!(focus ?? picked),
    geoSource: loc.source,
    geoLoading: geoHook.loading && !loc.override,
    geoDenied: loc.denied,
    rtLoading: nb.rtLoading,
    rtError: nb.rtError,
    rtHasData: nb.rtHasData,
    offlineLoading: nb.offlineLoading,
    bus: nb.bus,
    nearestStop: nb.nearestStop,
  });

  const snap = nb.snapshot;
  const pinStops = useMemo(() => (located ? nearestStops(coords, 9) : []), [coords, located]);
  const dueByStop = useMemo(() => {
    const m = new Map<string, number>();
    if (!snap) return m;
    const now = Date.now() / 1000;
    for (const a of snap.arrivals) {
      if (a.arrivalUnix < now - 30 || a.arrivalUnix > now + 20 * 60) continue;
      m.set(a.stopId, (m.get(a.stopId) ?? 0) + 1);
    }
    return m;
  }, [snap]);
  const liveNear = useMemo(() => {
    if (!snap || !located) return 0;
    return snap.vehicles.filter((v) => distanceKm(coords, { lat: v.lat, lng: v.lng }) <= 1.5)
      .length;
  }, [snap, coords, located]);

  const cardStopId =
    state.kind === "bus" ? state.bus.stopId : state.kind === "none" ? state.stopId : null;
  const pins = mounted
    ? pinStops.map((s) => {
        const on = s.id === cardStopId;
        const due = dueByStop.get(s.id) ?? 0;
        return {
          id: s.id,
          lat: s.lat,
          lng: s.lng,
          node: (
            <button
              type="button"
              className={`r-pin${on ? " r-pin--on" : ""}`}
              aria-label={r("now.openStop", { name: s.name })}
              aria-pressed={on}
              onClick={() => setFocus(s.id)}
            >
              <Icon name="bus" />
              {due > 0 ? (
                <span className="r-badge" aria-hidden="true">
                  {due}
                </span>
              ) : null}
            </button>
          ),
        };
      })
    : [];

  const bus = state.kind === "bus" ? state.bus : null;
  const vehicle =
    bus && bus.backing === "live" ? snap?.vehicles.find((v) => v.tripId === bus.tripId) : undefined;
  const vehKm =
    vehicle && bus
      ? distanceKm({ lat: vehicle.lat, lng: vehicle.lng }, { lat: bus.stopLat, lng: bus.stopLng })
      : null;
  const linesAtStop = useMemo(() => {
    const st = stops.find((s) => s.id === cardStopId);
    const n = st ? new Set(st.routes.map((x) => x.code).filter((c) => c !== "—")).size : 0;
    return Math.max(n, 1);
  }, [stops, cardStopId]);
  const walkM =
    bus && Number.isFinite(distanceKm(coords, { lat: bus.stopLat, lng: bus.stopLng })) && located
      ? Math.round((distanceKm(coords, { lat: bus.stopLat, lng: bus.stopLng }) * 1000) / 10) * 10
      : null;

  const saved = useSavedPlaces()
    .filter((p) => p.pinned)
    .slice(0, 3);
  const chips = [
    ...saved.map((p) => ({
      key: p.id,
      icon: /home|σπίτι/i.test(p.label)
        ? "house"
        : /uni|πανεπ/i.test(p.label)
          ? "graduation-cap"
          : /work|office|δουλ/i.test(p.label)
            ? "briefcase"
            : "map-pin",
      label: p.label,
      href: placeHref({ lat: p.lat, lng: p.lng, label: p.name || p.label }),
    })),
    { key: "lca", icon: "airplane-tilt", label: r("now.airport"), href: placeHref(LCA) },
  ].slice(0, 3);

  const active = useActiveTrip();
  const activeBus = active?.option.legs.find((l) => l.kind === "bus");
  const [sheet, setSheet] = useState<{ mode: "search" | "pick"; voice: boolean } | null>(null);
  const focusStop = focus ? getStop(focus) : null;
  const center = focusStop ?? coords;

  return (
    <div className="roam r-now" lang={locale}>
      <div className="r-now-map" aria-hidden={false}>
        <MapPreview
          bare
          center={{ lat: center.lat - 0.0032, lng: center.lng }}
          spanKm={1.6}
          liveVehicles
          pins={pins}
          userLocation={located ? { lat: coords.lat, lng: coords.lng } : null}
          fitToContent={false}
          attribTop={NOW_ATTRIB_TOP}
        />
        <div className="r-shade-top" style={{ height: 250 }} />
        <div className="r-haze r-haze--tl" />
        <div className="r-haze r-haze--tr" />
      </div>

      <OfflineBanner />
      <section className="r-now-screen">
        <header className="r-now-head">
          <AvatarButton variant="frost" />
          <h1 className="r-now-title r-scrim-text">{r("now.title")}</h1>
          <FrostButton
            icon="sliders-horizontal"
            label={r("now.filter")}
            onClick={() => setSheet({ mode: "search", voice: false })}
          />
        </header>
        <p className="r-now-sub r-scrim-text" aria-live="polite">
          {located && mounted
            ? liveNear > 0
              ? r("now.sub", { stops: pinStops.length, live: liveNear })
              : r("now.subNoLive", { stops: pinStops.length })
            : r("now.locating")}
        </p>
        <nav className="r-now-chips" aria-label={r("now.search")}>
          {chips.map((c) => (
            <a key={c.key} href={c.href} className="r-pill r-pill--glass r-pill--lg">
              <Icon name={c.icon} />
              {c.label}
            </a>
          ))}
          <button
            type="button"
            className="r-pill r-pill--glass r-pill--lg"
            onClick={() => setSheet({ mode: "search", voice: false })}
            aria-label={r("now.search")}
          >
            <Icon name="magnifying-glass" />
          </button>
        </nav>

        <div className="r-now-bottom">
          <div className="r-now-pills">
            {vehKm != null && bus ? (
              <span className="r-pill r-pill--glass r-tnum">
                <Icon name="navigation-arrow" />
                {r("now.busAway", { line: bus.line, km: vehKm.toFixed(1) })}
              </span>
            ) : (
              <span />
            )}
            {mounted && active ? (
              <Link
                to="/trip/$id"
                params={{ id: active.option.id }}
                className="r-pill r-pill--glass"
              >
                <Icon name="house-line" style={{ color: "var(--r-y)" }} />
                {activeBus && activeBus.kind === "bus"
                  ? `${activeBus.routeShort} · ${active.to.label}`
                  : r("now.resume")}
              </Link>
            ) : null}
          </div>
          <NowCard
            state={state}
            tiles={nb.tiles}
            linesAtStop={linesAtStop}
            walkM={walkM}
            onAllowLocation={loc.ask}
            onPickStop={() => setSheet({ mode: "pick", voice: false })}
            onRetry={nb.refetch}
            origin={
              located && bus ? { lat: coords.lat, lng: coords.lng, label: bus.stopName } : null
            }
          />
        </div>
      </section>

      <NowMore stops={located && mounted ? stops : []} live={loc.source === "live"} />
      <PasskeyEnrollPrompt />
      <ResumeTripPill />
      <TabBar dark />
      <SkySearchSheet
        open={!!sheet}
        mode={sheet?.mode ?? "search"}
        voice={!!sheet?.voice}
        onClose={() => setSheet(null)}
        vehicles={snap?.vehicles ?? []}
        coords={coords}
        onPickedStop={(id) => {
          setFocus(null);
          pickStop(id);
        }}
        onUseNearest={() => {
          setFocus(null);
          pickStop(null);
        }}
        hasPickedStop={!!picked}
      />
    </div>
  );
}
