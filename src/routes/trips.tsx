import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { reverseLookup } from "@/lib/maps.functions";
import { planMultiLeg } from "@/lib/multileg.functions";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/itinerary-types";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import { nearestCity } from "@/lib/cities";
import { pushRecent, setActiveTrip } from "@/lib/trip-store";
import { getTripSuggestions } from "@/lib/suggestions.functions";
import { getDeviceId } from "@/lib/pwa";
import planHero from "@/assets/plan-hero.jpg";
import type { Point } from "@/lib/plan-types";
import { cyprusLocalToUnix, formatYYYYMMDD, itineraryToJourneyOption } from "@/lib/plan-bridge";
import { ItineraryResults } from "@/components/plan/ItineraryResults";
import { PlacesPickerSheet } from "@/components/plan/PlacesPicker";
import {
  EmptyState,
  FieldRow,
  PersonalSuggestions,
  PlanningSkeleton,
  TimeIntentChip,
} from "@/components/plan/PlanPieces";

import { useAuth } from "@/lib/useAuth";
import {
  ArrivalPromiseCommit,
  ArrivalPromiseWatchList,
} from "@/components/plan/ArrivalPromiseCard";
import { useI18n } from "@/lib/i18n";
import { recordTimeUsage } from "@/lib/time-history";
import { useAccessibilityPrefs } from "@/lib/useAccessibilityPrefs";
import { isActive as isA11yActive } from "@/lib/accessibility-prefs";
import { suggestParkAndRide } from "@/lib/park-and-ride.functions";
import { ParkAndRideCard } from "@/components/ParkAndRideCard";
import { suggestLastMileChain } from "@/lib/last-mile-chain.functions";
import { LastMileChainCard } from "@/components/LastMileChainCard";
import { suggestBikeShare } from "@/lib/bikeshare.functions";
import { BikeShareCard } from "@/components/BikeShareCard";
import { suggestBoltScooter } from "@/lib/bolt-scooter.functions";
import { suggestKapnos } from "@/lib/kapnos.functions";
import { KapnosShuttleCard } from "@/components/KapnosShuttleCard";
import { BoltScooterCard } from "@/components/BoltScooterCard";
import { getDustAdvisory } from "@/lib/pulse-live.functions";
import { DustAdvisoryBanner } from "@/components/DustAdvisoryBanner";
import { getItineraryTrafficAlerts } from "@/lib/traffic-alerts.functions";
import { TrafficAlertsCard } from "@/components/TrafficAlertsCard";

export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [
      { title: "Plan a trip — Aloya" },
      {
        name: "description",
        content:
          "Door-to-door bus journeys across Cyprus, blending live vehicle data with walking directions.",
      },
      { property: "og:title", content: "Plan a trip — Aloya" },
      {
        property: "og:description",
        content: "Door-to-door across Cyprus. Live buses, walking, transfers — one calm view.",
      },
      { property: "og:url", content: "https://app.aloya.cy/trips" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://app.aloya.cy/og/og-trips.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Cypriot aegean-blue shutters slightly ajar on a sun-warmed limestone wall.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://app.aloya.cy/og/og-trips.jpg" },
    ],
    links: [
      { rel: "canonical", href: "https://app.aloya.cy/trips" },
      { rel: "alternate", hrefLang: "en", href: "https://app.aloya.cy/trips" },
      { rel: "alternate", hrefLang: "el", href: "https://app.aloya.cy/trips" },
      { rel: "alternate", hrefLang: "x-default", href: "https://app.aloya.cy/trips" },
    ],
  }),
  component: Plan,
});

function Plan() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [active, setActive] = useState<"from" | "to" | null>(null);
  const [timeIntent, setTimeIntent] = useState<{
    leaveByISO: string | null;
    arriveByISO: string | null;
  } | null>(null);

  // Prefill from /plan/:token → "Open this plan in Aloya" deep-link.
  // The share page appends fromLabel/fromLat/fromLng/toLabel/toLat/toLng/dep
  // — we hydrate origin, destination, and leave-by time, then strip the
  // params so refreshes don't keep re-triggering the same plan.
  const hydratedFromUrlRef = useRef(false);
  useEffect(() => {
    if (hydratedFromUrlRef.current) return;
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const fromLat = parseFloat(sp.get("fromLat") ?? "");
    const fromLng = parseFloat(sp.get("fromLng") ?? "");
    const toLat = parseFloat(sp.get("toLat") ?? "");
    const toLng = parseFloat(sp.get("toLng") ?? "");
    const fromLabel = sp.get("fromLabel") ?? "";
    const toLabel = sp.get("toLabel") ?? "";
    const hasFrom = Number.isFinite(fromLat) && Number.isFinite(fromLng) && !!fromLabel;
    const hasTo = Number.isFinite(toLat) && Number.isFinite(toLng) && !!toLabel;
    if (hasFrom && hasTo) {
      hydratedFromUrlRef.current = true;
      setOrigin({ lat: fromLat, lng: fromLng, label: fromLabel });
      setDestination({ lat: toLat, lng: toLng, label: toLabel });
      const dep = parseInt(sp.get("dep") ?? "", 10);
      if (Number.isFinite(dep) && dep > 0) {
        // Only honour a future departure — a past `dep` from a stale link
        // would return an empty plan; falling back to "leave now" is kinder.
        const iso = new Date(dep * 1000).toISOString();
        if (dep * 1000 > Date.now() - 60_000) {
          setTimeIntent({ leaveByISO: iso, arriveByISO: null });
        }
      }
      // Clean the URL so it reads as /trips going forward.
      window.history.replaceState({}, "", "/trips");
    } else if (hasTo) {
      // Destination-only prefill (from the group page). Focus the origin
      // picker so the rider only has to say where they're starting from.
      hydratedFromUrlRef.current = true;
      setDestination({ lat: toLat, lng: toLng, label: toLabel });
      setActive("from");
      window.history.replaceState({}, "", "/trips");
    }
  }, []);

  const planFn = useServerFn(planMultiLeg);
  const reverseFn = useServerFn(reverseLookup);
  const fetchSuggestions = useServerFn(getTripSuggestions);

  const { session } = useAuth();
  const { data: suggData } = useQuery({
    queryKey: ["trip-suggestions", session?.user?.id ?? null],
    queryFn: async () => {
      const { getDeviceToken, getAccessToken } = await import("@/lib/pwa");
      const [token, accessToken] = await Promise.all([getDeviceToken(), getAccessToken()]);
      if (!token) return { suggestions: [] };
      return fetchSuggestions({
        data: { deviceId: getDeviceId(), deviceToken: token, accessToken },
      });
    },
    staleTime: 5 * 60 * 1000,
    enabled: typeof window !== "undefined",
  });
  const personalSuggestions = suggData?.suggestions ?? [];

  // Live realtime tick — every time vehicle positions / ETAs refresh, we
  // know the planner has fresher signals to chew on.
  const { data: rt } = useRealtime();
  const rtTick = rt?.fetchedAt ?? 0;

  const { prefs: a11yPrefs } = useAccessibilityPrefs();
  const a11yOn = isA11yActive(a11yPrefs);
  // Stable key segment so React Query re-plans when prefs change.
  const a11yKey = a11yOn
    ? `${a11yPrefs.stepFree ? "s" : ""}${a11yPrefs.preferShade ? "h" : ""}${a11yPrefs.lowFloor ? "l" : ""}-${a11yPrefs.maxWalkMeters ?? "x"}`
    : "off";

  // Plan results driven by useQuery so they auto-refresh:
  //   - every 30s while the screen is open
  //   - on window focus / reconnect
  //   - whenever the realtime feed advances (rtTick in the key)
  // This is what makes "the bus left, give me the next one" feel automatic.
  const planQuery = useQuery({
    queryKey: [
      "plan",
      origin?.lat,
      origin?.lng,
      destination?.lat,
      destination?.lng,
      timeIntent?.leaveByISO ?? null,
      timeIntent?.arriveByISO ?? null,
      rtTick,
      a11yKey,
    ],
    queryFn: async () => {
      if (!origin || !destination)
        return {
          itineraries: [] as Itinerary[],
          noScheduleAvailable: undefined,
          requestedDate: undefined,
        };
      const departAtUnix = timeIntent?.leaveByISO
        ? Math.floor(new Date(timeIntent.leaveByISO).getTime() / 1000)
        : undefined;
      // Learn the rider's rhythm from times they actually planned around, so
      // the picker's shortcuts get personal instead of staying hardcoded.
      if (timeIntent?.arriveByISO)
        recordTimeUsage({ atMs: new Date(timeIntent.arriveByISO).getTime(), mode: "arrive" });
      else if (timeIntent?.leaveByISO)
        recordTimeUsage({ atMs: new Date(timeIntent.leaveByISO).getTime(), mode: "leave" });
      const arriveByUnix = timeIntent?.arriveByISO
        ? Math.floor(new Date(timeIntent.arriveByISO).getTime() / 1000)
        : undefined;
      const res = await planFn({
        data: {
          from: origin,
          to: destination,
          departAtUnix,
          arriveByUnix,
          a11y: a11yOn
            ? {
                stepFree: a11yPrefs.stepFree,
                preferShade: a11yPrefs.preferShade,
                lowFloor: a11yPrefs.lowFloor,
                maxWalkMeters: a11yPrefs.maxWalkMeters,
              }
            : undefined,
        },
      });
      return res;
    },
    enabled: !!origin && !!destination,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    // Silent background refresh: keep the previously-rendered itineraries
    // on screen while the next plan loads, so the list never blanks out
    // mid-read and per-card state (like "Remind me set") stays mounted.
    placeholderData: keepPreviousData,
    notifyOnChangeProps: ["data", "error"],
  });
  const results = planQuery.data?.itineraries ?? null;
  const planning = planQuery.isFetching && !planQuery.data;
  const planError = planQuery.error
    ? planQuery.error instanceof Error
      ? planQuery.error.message
      : t("trips.planFailed")
    : null;

  // Wave 2.3 — Park & Ride evaluation runs in parallel with the bus plan
  // and is fed the bus-only baseline so it only suggests when it actually
  // helps. Cheap: gated on origin/destination geometry server-side; at
  // most two driving-route calls per evaluation.
  const pnrFn = useServerFn(suggestParkAndRide);
  const busOnlyTop = results?.[0] ?? null;
  const busOnlyAccessWalkM = (() => {
    if (!busOnlyTop) return null;
    const firstWalk = busOnlyTop.legs.find((l) => l.kind === "walk");
    return firstWalk && firstWalk.kind === "walk" ? Math.round(firstWalk.distanceMeters) : 0;
  })();
  const pnrQuery = useQuery({
    queryKey: [
      "pnr",
      origin?.lat,
      origin?.lng,
      destination?.lat,
      destination?.lng,
      busOnlyTop?.totalDurationSec ?? null,
      busOnlyAccessWalkM,
    ],
    queryFn: async () => {
      if (!origin || !destination) return null;
      try {
        return await pnrFn({
          data: {
            from: { lat: origin.lat, lng: origin.lng, label: origin.label },
            to: { lat: destination.lat, lng: destination.lng, label: destination.label },
            busOnlyDurationSec: busOnlyTop?.totalDurationSec ?? null,
            busOnlyAccessWalkM,
          },
        });
      } catch {
        return null;
      }
    },
    enabled: !!origin && !!destination,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const pnr = pnrQuery.data ?? null;

  // Wave 3 — Last-mile chain (taxi handoff). Only relevant when the top
  // itinerary's final walk is meaningfully long, or when the arrival is
  // after-hours. We extract the final walk leg and arrival time from the
  // top result and ask the server. Server applies the real trigger gates
  // and only returns a suggestion when it would actually help.
  const chainFn = useServerFn(suggestLastMileChain);
  const topItin: Itinerary | null = (results?.[0] as Itinerary | undefined) ?? null;
  const finalWalkInfo = (() => {
    if (!topItin) return null;
    const legs = topItin.legs;
    for (let i = legs.length - 1; i >= 0; i--) {
      const l = legs[i];
      if (l.kind === "walk") {
        const wl = l as WalkLeg;
        // Only meaningful when the walk follows a ride (i.e. egress walk).
        const hasPriorRide = legs.slice(0, i).some((p) => p.kind === "ride");
        if (!hasPriorRide) return null;
        return {
          walkMeters: Math.round(wl.distanceMeters),
          alight: { lat: wl.from.lat, lng: wl.from.lng, name: wl.from.name },
        };
      }
    }
    return null;
  })();
  const chainQuery = useQuery({
    queryKey: [
      "lastMileChain",
      destination?.lat,
      destination?.lng,
      finalWalkInfo?.alight.lat,
      finalWalkInfo?.alight.lng,
      finalWalkInfo?.walkMeters,
      topItin?.arrivalUnix ?? null,
    ],
    queryFn: async () => {
      if (!destination || !finalWalkInfo || !topItin) return null;
      // Cheap client gate: skip server call unless walk is at least
      // moderately long. Server re-checks with the full rule set.
      if (finalWalkInfo.walkMeters < 800) return null;
      try {
        return await chainFn({
          data: {
            alight: finalWalkInfo.alight,
            destination: {
              lat: destination.lat,
              lng: destination.lng,
              name: destination.label,
            },
            arrivalUnix: topItin.arrivalUnix,
            finalWalkMeters: finalWalkInfo.walkMeters,
          },
        });
      } catch {
        return null;
      }
    },
    enabled: !!destination && !!finalWalkInfo && !!topItin,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const lastMileChain = chainQuery.data ?? null;

  // Wave 3 — Traffic alerts overlay. Extract sample points from the top
  // itinerary (board/alight + walk endpoints) and check the CyNAP DATEX
  // feed for anything within 500 m. The server does the freshness gate.
  const trafficFn = useServerFn(getItineraryTrafficAlerts);
  const trafficPoints = (() => {
    if (!topItin) return [] as Array<{ lat: number; lng: number }>;
    const pts: Array<{ lat: number; lng: number }> = [];
    for (const l of topItin.legs) {
      if (l.kind === "ride") {
        pts.push({ lat: l.board.lat, lng: l.board.lng });
        pts.push({ lat: l.alight.lat, lng: l.alight.lng });
      } else if (l.kind === "walk") {
        pts.push({ lat: l.from.lat, lng: l.from.lng });
        pts.push({ lat: l.to.lat, lng: l.to.lng });
      }
    }
    return pts;
  })();
  const trafficKey = trafficPoints.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join("|");
  const trafficQuery = useQuery({
    queryKey: ["itinTraffic", trafficKey],
    queryFn: async () => {
      if (trafficPoints.length === 0) return null;
      try {
        return await trafficFn({ data: { points: trafficPoints } });
      } catch {
        return null;
      }
    },
    enabled: trafficPoints.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const trafficReport = trafficQuery.data ?? null;

  // Wave 3 — Bike-share alternative (Nextbike). Short to mid-distance
  // intra-city trips where docked bikes + free racks are within a short
  // walk on both ends, and the cycle beats the bus by ≥ 3 min.
  const bikeFn = useServerFn(suggestBikeShare);
  const bikeQuery = useQuery({
    queryKey: [
      "bikeShare",
      origin?.lat,
      origin?.lng,
      destination?.lat,
      destination?.lng,
      busOnlyTop?.totalDurationSec ?? null,
    ],
    queryFn: async () => {
      if (!origin || !destination) return null;
      try {
        return await bikeFn({
          data: {
            from: { lat: origin.lat, lng: origin.lng },
            to: { lat: destination.lat, lng: destination.lng },
            busOnlyDurationSec: busOnlyTop?.totalDurationSec ?? null,
          },
        });
      } catch {
        return null;
      }
    },
    enabled: !!origin && !!destination,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const bikeShare = bikeQuery.data ?? null;

  // Wave 3 — Bolt e-scooter alternative (Nicosia only). Both endpoints
  // must sit within walking distance of a mandated parking zone.
  const boltFn = useServerFn(suggestBoltScooter);
  const boltQuery = useQuery({
    queryKey: [
      "boltScooter",
      origin?.lat,
      origin?.lng,
      destination?.lat,
      destination?.lng,
      busOnlyTop?.totalDurationSec ?? null,
    ],
    queryFn: async () => {
      if (!origin || !destination) return null;
      try {
        return await boltFn({
          data: {
            from: { lat: origin.lat, lng: origin.lng },
            to: { lat: destination.lat, lng: destination.lng },
            busOnlyDurationSec: busOnlyTop?.totalDurationSec ?? null,
          },
        });
      } catch {
        return null;
      }
    },
    enabled: !!origin && !!destination,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const boltScooter = boltQuery.data ?? null;

  // Trip-level Saharan-dust / air-quality advisory. Re-uses the pulse_signals
  // air feed (already ingested every hour) — no extra API quota. Fires only
  // when there is something actionable to say at the origin's nearest zone.
  const dustFn = useServerFn(getDustAdvisory);
  const dustQuery = useQuery({
    queryKey: ["dust-advisory", origin?.lat, origin?.lng],
    queryFn: async () => {
      if (!origin) return null;
      try {
        return await dustFn({ data: { lat: origin.lat, lng: origin.lng } });
      } catch {
        return null;
      }
    },
    enabled: !!origin,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
  const dustAdvisory = dustQuery.data ?? null;

  // Wave 3 — Kapnos Airport Shuttle (only fires when one endpoint is at
  // LCA or PFO airport AND the other is near a Kapnos city station).
  const kapnosFn = useServerFn(suggestKapnos);
  const kapnosAfterUnix = timeIntent?.leaveByISO
    ? Math.floor(new Date(timeIntent.leaveByISO).getTime() / 1000)
    : undefined;
  // The rider's arrive-by intent in unix seconds — drives the arrival promise.
  const arriveByUnix = timeIntent?.arriveByISO
    ? Math.floor(new Date(timeIntent.arriveByISO).getTime() / 1000)
    : null;

  const kapnosBeforeUnix = timeIntent?.arriveByISO
    ? Math.floor(new Date(timeIntent.arriveByISO).getTime() / 1000)
    : undefined;
  const kapnosQuery = useQuery({
    queryKey: [
      "kapnos",
      origin?.lat,
      origin?.lng,
      destination?.lat,
      destination?.lng,
      kapnosAfterUnix ?? null,
      kapnosBeforeUnix ?? null,
    ],
    queryFn: async () => {
      if (!origin || !destination) return null;
      try {
        return await kapnosFn({
          data: {
            from: { lat: origin.lat, lng: origin.lng },
            to: { lat: destination.lat, lng: destination.lng },
            afterUnix: kapnosAfterUnix,
            beforeUnix: kapnosBeforeUnix,
          },
        });
      } catch {
        return null;
      }
    },
    enabled: !!origin && !!destination,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const kapnos = kapnosQuery.data ?? null;

  // Wave 3 — Plan the city-bus FIRST mile to the Kapnos coach stop when the
  // rider is too far to walk. We don't tell people "take a bus or taxi" —
  // we plan the bus for them, same as any other journey.
  const KAPNOS_WALKABLE_M = 1_200;
  const kapnosPickupFar = !!kapnos && kapnos.pickup.distanceM > KAPNOS_WALKABLE_M;
  const kapnosDropoffFar = !!kapnos && kapnos.dropoff.distanceM > KAPNOS_WALKABLE_M;

  // Kapnos wall-clock → unix seconds (DST-safe) lives in plan-bridge.

  // Tie the first-mile bus search to the coach we're trying to catch (arriveBy
  // = coach departure). Last-mile starts when the coach arrives. This is what
  // makes a "leave tomorrow 6am" trip plan against tomorrow's coach instead of
  // searching at the current moment.
  const kapnosNext = kapnos?.departures[0];
  const coachDepartUnix = kapnosNext ? cyprusLocalToUnix(kapnosNext.departLocal) : undefined;
  const coachArriveUnix = kapnosNext ? cyprusLocalToUnix(kapnosNext.arriveLocal) : undefined;

  const firstMileQuery = useQuery({
    queryKey: [
      "kapnos.firstMile",
      origin?.lat,
      origin?.lng,
      kapnos?.pickup.lat,
      kapnos?.pickup.lng,
      coachDepartUnix ?? null,
      a11yKey,
    ],
    queryFn: async () => {
      if (!origin || !kapnos || !kapnosPickupFar) return null;
      try {
        const res = await planFn({
          data: {
            from: { lat: origin.lat, lng: origin.lng, label: origin.label },
            to: {
              lat: kapnos.pickup.lat,
              lng: kapnos.pickup.lng,
              label: kapnos.pickup.name,
            },
            arriveByUnix: coachDepartUnix,
            a11y: a11yOn
              ? {
                  stepFree: a11yPrefs.stepFree,
                  preferShade: a11yPrefs.preferShade,
                  lowFloor: a11yPrefs.lowFloor,
                  maxWalkMeters: a11yPrefs.maxWalkMeters,
                }
              : undefined,
          },
        });
        return res.itineraries[0] ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!origin && !!kapnos && kapnosPickupFar,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });
  const firstMileItin = firstMileQuery.data ?? null;

  const lastMileQuery = useQuery({
    queryKey: [
      "kapnos.lastMile",
      kapnos?.dropoff.lat,
      kapnos?.dropoff.lng,
      destination?.lat,
      destination?.lng,
      coachArriveUnix ?? null,
      a11yKey,
    ],
    queryFn: async () => {
      if (!destination || !kapnos || !kapnosDropoffFar) return null;
      try {
        const res = await planFn({
          data: {
            from: {
              lat: kapnos.dropoff.lat,
              lng: kapnos.dropoff.lng,
              label: kapnos.dropoff.name,
            },
            to: {
              lat: destination.lat,
              lng: destination.lng,
              label: destination.label,
            },
            departAtUnix: coachArriveUnix,
            a11y: a11yOn
              ? {
                  stepFree: a11yPrefs.stepFree,
                  preferShade: a11yPrefs.preferShade,
                  lowFloor: a11yPrefs.lowFloor,
                  maxWalkMeters: a11yPrefs.maxWalkMeters,
                }
              : undefined,
          },
        });
        return res.itineraries[0] ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!destination && !!kapnos && kapnosDropoffFar,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });
  const lastMileItin = lastMileQuery.data ?? null;

  // Force a re-plan the moment the top result's bus has just departed —
  // the static refetchInterval would otherwise leave a stale "next bus" on
  // screen for up to 30 seconds after it pulled away.
  useEffect(() => {
    if (!results || results.length === 0) return;
    const first = results[0];
    const firstRide = first.legs.find((l): l is RideLeg => l.kind === "ride");
    if (!firstRide) return;
    const msUntilDeparture = firstRide.board.departureUnix * 1000 - Date.now();
    if (msUntilDeparture <= 0) {
      planQuery.refetch();
      return;
    }
    // Fire a refetch ~5s after the scheduled departure so live delays settle.
    const t = window.setTimeout(
      () => planQuery.refetch(),
      Math.min(msUntilDeparture + 5_000, 60_000),
    );
    return () => window.clearTimeout(t);
  }, [results, planQuery]);

  // If the user arrived from the NL planner or a learned-commute card, the
  // resolved Points were stashed in sessionStorage. Apply them once on mount;
  // they take precedence over the geolocation default.
  // Flag stashed synchronously so the geolocation seeding effect (which runs
  // right after this one on the same mount) knows an NL/commute origin was
  // applied and must NOT be overwritten by the cached/live geo fix.
  const consumedNlPlanRef = useRef(false);
  const nlSeededOriginRef = useRef(false);
  useEffect(() => {
    if (consumedNlPlanRef.current || typeof window === "undefined") return;
    consumedNlPlanRef.current = true;
    try {
      const raw = sessionStorage.getItem("aloya:nl-plan");
      if (!raw) return;
      sessionStorage.removeItem("aloya:nl-plan");
      const plan = JSON.parse(raw) as {
        from: Point | null;
        to: Point;
        leaveByISO?: string | null;
        arriveByISO?: string | null;
      };
      if (plan?.to) {
        setDestination(plan.to);
        pushRecent({ name: plan.to.label, lat: plan.to.lat, lng: plan.to.lng });
      }
      if (plan?.from) {
        nlSeededOriginRef.current = true;
        setOrigin(plan.from);
        setActive(null);
      }
      if (plan?.leaveByISO || plan?.arriveByISO) {
        setTimeIntent({
          leaveByISO: plan.leaveByISO ?? null,
          arriveByISO: plan.arriveByISO ?? null,
        });
      }
    } catch {}
  }, []);

  // Try to seed origin from geolocation once (skipped if NL plan provided one).
  // Uses the cached fix populated by the home page for an instant result, then
  // refines via getCurrentPosition. Falls back to Nicosia centre only after the
  // browser hard-fails (denied / unavailable / final timeout).
  useEffect(() => {
    if (origin || nlSeededOriginRef.current || typeof window === "undefined") return;
    let cancelled = false;

    const applyFix = async (latitude: number, longitude: number) => {
      if (cancelled) return;
      // Optimistic label so the UI unlocks immediately while reverse-geo resolves.
      setOrigin({
        lat: latitude,
        lng: longitude,
        label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      });
      try {
        const { address } = await reverseFn({ data: { lat: latitude, lng: longitude } });
        if (cancelled) return;
        setOrigin({ lat: latitude, lng: longitude, label: address });
      } catch {
        /* keep optimistic label */
      }
    };

    // 1) Instant seed from the shared cache populated by useGeolocation().
    try {
      const raw = localStorage.getItem("aloya:geo");
      if (raw) {
        const parsed = JSON.parse(raw) as { lat: number; lng: number; ts: number };
        if (parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
          void applyFix(parsed.lat, parsed.lng);
        }
      }
    } catch {
      /* ignore */
    }

    // 2) Always try a fresh fix. High accuracy, generous timeout, accept a
    //    recent cached browser fix so we don't re-prompt on every navigation.
    if (!("geolocation" in navigator)) return;
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled || origin) return;
      // Only show Nicosia fallback if nothing seeded after 12s.
      setOrigin(
        (cur) =>
          cur ?? {
            lat: NICOSIA_CENTER.lat,
            lng: NICOSIA_CENTER.lng,
            label: "Nicosia centre",
          },
      );
    }, 12_000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(fallbackTimer);
        const { latitude, longitude } = pos.coords;
        try {
          localStorage.setItem(
            "aloya:geo",
            JSON.stringify({ lat: latitude, lng: longitude, ts: Date.now() }),
          );
        } catch {
          /* ignore */
        }
        void applyFix(latitude, longitude);
      },
      () => {
        window.clearTimeout(fallbackTimer);
        if (cancelled) return;
        // If cache already seeded an origin, keep it; otherwise fall back.
        setOrigin(
          (cur) =>
            cur ?? {
              lat: NICOSIA_CENTER.lat,
              lng: NICOSIA_CENTER.lng,
              label: "Nicosia centre",
            },
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPick(point: Point, role: "from" | "to") {
    if (role === "from") {
      setOrigin(point);
      setActive(destination ? null : "to");
    } else {
      setDestination(point);
      pushRecent({ name: point.label, lat: point.lat, lng: point.lng });
      setActive(origin ? null : "from");
    }
  }

  function startPlannedItinerary(itinerary: Itinerary, from: Point, to: Point) {
    const option = itineraryToJourneyOption(itinerary);
    if (!option) return;
    const rides = itinerary.legs.filter((l): l is RideLeg => l.kind === "ride");
    const isSingleRide = rides.length === 1;
    setActiveTrip({
      startedAt: Date.now(),
      option,
      from,
      to,
      itinerary: isSingleRide ? undefined : itinerary,
      legState: isSingleRide
        ? undefined
        : { currentLegIndex: 0, perLeg: { 0: { enteredAt: Date.now() } } },
    });
    void navigate({ to: "/trip/$id", params: { id: option.id } });
  }

  return (
    <AppShell>
      <header className="relative px-6 pt-2 pb-5 animate-rise">
        <img
          src={planHero}
          alt=""
          aria-hidden
          loading="lazy"
          width={1280}
          height={896}
          className="pointer-events-none absolute right-[-30%] top-[-10%] w-[90%] opacity-[0.18] mix-blend-multiply"
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
          {t("trips.kicker")}
        </p>
        <h1 className="font-display text-[40px] leading-[1.04] mt-1.5 text-ink text-balance">
          {t("trips.titlePrefix")}{" "}
          <span className="italic text-aegean-deep">{t("trips.titleEmph")}</span>.
          <br />
          {t("trips.titleSuffix")}
        </h1>
      </header>

      <section className="px-6 animate-rise" style={{ animationDelay: "60ms" }}>
        <div className="rounded-[28px] bg-card ring-1 ring-line p-2">
          <FieldRow
            role="from"
            label={t("trips.from")}
            point={origin}
            active={active === "from"}
            onActivate={() => setActive("from")}
            onClear={() => {
              setOrigin(null);
            }}
          />
          <div className="mx-5 h-px bg-line" />
          <FieldRow
            role="to"
            label={t("trips.to")}
            point={destination}
            active={active === "to"}
            onActivate={() => setActive("to")}
            onClear={() => {
              setDestination(null);
            }}
          />
        </div>

        <TimeIntentChip
          intent={timeIntent}
          onChange={setTimeIntent}
          onClear={() => setTimeIntent(null)}
        />

        <PlacesPickerSheet
          open={active !== null}
          role={active ?? "to"}
          // Wave 2.5 — bias autocomplete to the rider's actual city.
          bias={origin ? nearestCity(origin.lat, origin.lng).center : NICOSIA_CENTER}
          onClose={() => setActive(null)}
          onPick={onPick}
        />
      </section>

      <section className="mt-7 px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <ArrivalPromiseWatchList />
      </section>

      <section className="mt-7 px-6 animate-rise" style={{ animationDelay: "140ms" }}>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-2xl text-ink">
            {results === null && !planning
              ? personalSuggestions.length > 0
                ? t("trips.yourUsuals")
                : t("trips.suggestions")
              : t("trips.bestRoutes")}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {planning
              ? t("trips.statusComputing")
              : results
                ? t("trips.statusLive")
                : personalSuggestions.length > 0
                  ? t("trips.statusLearned")
                  : t("trips.statusIdle")}
          </span>
        </div>

        {!results && !planning && personalSuggestions.length === 0 && (
          <EmptyState origin={origin} destination={destination} />
        )}

        {!results && !planning && personalSuggestions.length > 0 && (
          <PersonalSuggestions
            items={personalSuggestions}
            onPick={(s) => {
              const to: Point = { lat: s.toLat, lng: s.toLng, label: s.toLabel };
              setDestination(to);
              pushRecent({ name: s.toLabel, lat: s.toLat, lng: s.toLng });
              setActive(null);
              const o = origin ?? ({ lat: s.fromLat, lng: s.fromLng, label: s.fromLabel } as Point);
              if (!origin) setOrigin(o);
            }}
          />
        )}

        {planning && <PlanningSkeleton />}

        {planError && (
          <p className="rounded-3xl bg-card p-5 ring-1 ring-line text-[13px] text-ink-soft">
            {planError}
          </p>
        )}

        {results && results.length === 0 && !planning && (
          <div className="flex flex-col gap-3">
            {kapnos && (
              <KapnosShuttleCard
                suggestion={kapnos}
                firstMile={firstMileItin}
                lastMile={lastMileItin}
                firstMileLoading={kapnosPickupFar && firstMileQuery.isFetching && !firstMileItin}
                lastMileLoading={kapnosDropoffFar && lastMileQuery.isFetching && !lastMileItin}
                onPlanFirstMile={() => {
                  if (firstMileItin && origin) {
                    startPlannedItinerary(firstMileItin, origin, {
                      lat: kapnos.pickup.lat,
                      lng: kapnos.pickup.lng,
                      label: kapnos.pickup.name,
                    });
                    return;
                  }
                  setDestination({
                    lat: kapnos.pickup.lat,
                    lng: kapnos.pickup.lng,
                    label: kapnos.pickup.name,
                  });
                  setActive(null);
                  if (typeof window !== "undefined")
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onPlanLastMile={() => {
                  if (lastMileItin && destination) {
                    startPlannedItinerary(
                      lastMileItin,
                      {
                        lat: kapnos.dropoff.lat,
                        lng: kapnos.dropoff.lng,
                        label: kapnos.dropoff.name,
                      },
                      destination,
                    );
                    return;
                  }
                  setOrigin({
                    lat: kapnos.dropoff.lat,
                    lng: kapnos.dropoff.lng,
                    label: kapnos.dropoff.name,
                  });
                  setActive(null);
                  if (typeof window !== "undefined")
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
            <div className="rounded-3xl bg-card p-6 ring-1 ring-line">
              {planQuery.data?.noScheduleAvailable ? (
                <>
                  <p className="font-display text-xl text-ink">{t("trips.noScheduleTitle")}</p>
                  <p className="mt-1.5 text-[13px] text-ink-soft">
                    {t("trips.noScheduleBody", {
                      date: planQuery.data.requestedDate
                        ? formatYYYYMMDD(planQuery.data.requestedDate)
                        : t("trips.noScheduleDay"),
                    })}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-xl text-ink">{t("trips.noRouteTitle")}</p>
                  <p className="mt-1.5 text-[13px] text-ink-soft">{t("trips.noRouteBody")}</p>
                </>
              )}
            </div>
          </div>
        )}

        {results && results.length > 0 && origin && destination && (
          <div className="flex flex-col gap-3">
            {dustAdvisory && <DustAdvisoryBanner advisory={dustAdvisory} />}
            {arriveByUnix != null && (
              <ArrivalPromiseCommit
                origin={origin}
                destination={destination}
                targetArrivalUnix={arriveByUnix}
              />
            )}
            {kapnos && (
              <KapnosShuttleCard
                suggestion={kapnos}
                firstMile={firstMileItin}
                lastMile={lastMileItin}
                firstMileLoading={kapnosPickupFar && firstMileQuery.isFetching && !firstMileItin}
                lastMileLoading={kapnosDropoffFar && lastMileQuery.isFetching && !lastMileItin}
                onPlanFirstMile={() => {
                  if (firstMileItin && origin) {
                    startPlannedItinerary(firstMileItin, origin, {
                      lat: kapnos.pickup.lat,
                      lng: kapnos.pickup.lng,
                      label: kapnos.pickup.name,
                    });
                    return;
                  }
                  setDestination({
                    lat: kapnos.pickup.lat,
                    lng: kapnos.pickup.lng,
                    label: kapnos.pickup.name,
                  });
                  setActive(null);
                  if (typeof window !== "undefined")
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onPlanLastMile={() => {
                  if (lastMileItin && destination) {
                    startPlannedItinerary(
                      lastMileItin,
                      {
                        lat: kapnos.dropoff.lat,
                        lng: kapnos.dropoff.lng,
                        label: kapnos.dropoff.name,
                      },
                      destination,
                    );
                    return;
                  }
                  setOrigin({
                    lat: kapnos.dropoff.lat,
                    lng: kapnos.dropoff.lng,
                    label: kapnos.dropoff.name,
                  });
                  setActive(null);
                  if (typeof window !== "undefined")
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
            {pnr && (
              <ParkAndRideCard suggestion={pnr} origin={{ lat: origin.lat, lng: origin.lng }} />
            )}
            {bikeShare && <BikeShareCard suggestion={bikeShare} />}
            {boltScooter && <BoltScooterCard suggestion={boltScooter} />}
            {trafficReport && <TrafficAlertsCard report={trafficReport} />}
            <ItineraryResults results={results} origin={origin} destination={destination} />
            {lastMileChain && <LastMileChainCard suggestion={lastMileChain} />}
          </div>
        )}
      </section>
    </AppShell>
  );
}
