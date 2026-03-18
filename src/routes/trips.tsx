import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ItineraryCard } from "@/components/ItineraryCard";
import { createPortal } from "react-dom";
import { IconArrowUpRight, IconBriefcase, IconClock, IconClose, IconHome, IconPin, IconSearch, IconStar } from "@/components/Icons";
import { autocompletePlaces, getPlace, reverseLookup } from "@/lib/maps.functions";
import { planMultiLeg } from "@/lib/multileg.functions";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/itinerary-types";
import type { JourneyOption } from "@/lib/journey.server";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import { nearestCity } from "@/lib/cities";
import {
  pushRecent,
  setActiveTrip,
  useRecents,
  useSavedPlaces,
} from "@/lib/trip-store";
import { getTripSuggestions, type TripSuggestion } from "@/lib/suggestions.functions";
import { getDeviceId } from "@/lib/pwa";
import planHero from "@/assets/plan-hero.jpg";
import { ProGate } from "@/components/ProGate";
import { RemindMeButton } from "@/components/RemindMeButton";
import { useAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/i18n";
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
      { property: "og:description", content: "Door-to-door across Cyprus. Live buses, walking, transfers — one calm view." },
      { property: "og:url", content: "https://app.aloya.cy/trips" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://app.aloya.cy/og/og-trips.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Cypriot aegean-blue shutters slightly ajar on a sun-warmed limestone wall." },
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

type Point = { lat: number; lng: number; label: string };

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

  const planFn = useServerFn(planMultiLeg);
  const reverseFn = useServerFn(reverseLookup);
  const fetchSuggestions = useServerFn(getTripSuggestions);
  

  const { session } = useAuth();
  const { data: suggData } = useQuery({
    queryKey: ["trip-suggestions", session?.user?.id ?? null],
    queryFn: async () => {
      const { getDeviceToken, getAccessToken } = await import("@/lib/pwa");
      const [token, accessToken] = await Promise.all([
        getDeviceToken(),
        getAccessToken(),
      ]);
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
        return { itineraries: [] as Itinerary[], noScheduleAvailable: undefined, requestedDate: undefined };
      const departAtUnix = timeIntent?.leaveByISO
        ? Math.floor(new Date(timeIntent.leaveByISO).getTime() / 1000)
        : undefined;
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
    return firstWalk && firstWalk.kind === "walk"
      ? Math.round(firstWalk.distanceMeters)
      : 0;
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

  // Wave 3 — Kapnos Airport Shuttle (only fires when one endpoint is at
  // LCA or PFO airport AND the other is near a Kapnos city station).
  const kapnosFn = useServerFn(suggestKapnos);
  const kapnosAfterUnix = timeIntent?.leaveByISO
    ? Math.floor(new Date(timeIntent.leaveByISO).getTime() / 1000)
    : undefined;
  const kapnosBeforeUnix = timeIntent?.arriveByISO
    ? Math.floor(new Date(timeIntent.arriveByISO).getTime() / 1000)
    : undefined;
  const kapnosQuery = useQuery({
    queryKey: [
      "kapnos",
      origin?.lat, origin?.lng,
      destination?.lat, destination?.lng,
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
  const kapnosPickupFar =
    !!kapnos && kapnos.pickup.distanceM > KAPNOS_WALKABLE_M;
  const kapnosDropoffFar =
    !!kapnos && kapnos.dropoff.distanceM > KAPNOS_WALKABLE_M;

  // Convert Kapnos "YYYY-MM-DD HH:mm:ss" (Cyprus local wall-clock) → unix seconds.
  // Uses Intl to resolve the Asia/Nicosia offset for that specific date so DST is
  // handled correctly without hardcoding +2/+3.
  const cyprusLocalToUnix = (local: string): number | undefined => {
    const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return undefined;
    const Y = +m[1], Mo = +m[2], D = +m[3], H = +m[4], Mi = +m[5], S = +(m[6] ?? 0);
    const guess = Date.UTC(Y, Mo - 1, D, H, Mi, S);
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Nicosia",
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = dtf.formatToParts(new Date(guess));
    const get = (t: string) => +parts.find((p) => p.type === t)!.value;
    const asCy = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    const offset = asCy - guess; // ms Cyprus is ahead of UTC
    return Math.floor((guess - offset) / 1000);
  };

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
    } catch { /* ignore */ }

    // 2) Always try a fresh fix. High accuracy, generous timeout, accept a
    //    recent cached browser fix so we don't re-prompt on every navigation.
    if (!("geolocation" in navigator)) return;
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled || origin) return;
      // Only show Nicosia fallback if nothing seeded after 12s.
      setOrigin((cur) => cur ?? {
        lat: NICOSIA_CENTER.lat,
        lng: NICOSIA_CENTER.lng,
        label: "Nicosia centre",
      });
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
        } catch { /* ignore */ }
        void applyFix(latitude, longitude);
      },
      () => {
        window.clearTimeout(fallbackTimer);
        if (cancelled) return;
        // If cache already seeded an origin, keep it; otherwise fall back.
        setOrigin((cur) => cur ?? {
          lat: NICOSIA_CENTER.lat,
          lng: NICOSIA_CENTER.lng,
          label: "Nicosia centre",
        });
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
          {t("trips.titlePrefix")} <span className="italic text-aegean-deep">{t("trips.titleEmph")}</span>.
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


        {active && (
          <PlacesPicker
            role={active}
            // Wave 2.5 — bias autocomplete to the rider's actual city.
            // A Limassol rider typing "Mall" should get Limassol Mall first,
            // not Nicosia Mall. Falls back to Nicosia centre at cold start.
            bias={
              origin
                ? nearestCity(origin.lat, origin.lng).center
                : NICOSIA_CENTER
            }
            onPick={onPick}
          />
        )}
      </section>

      <section
        className="mt-7 px-6 animate-rise"
        style={{ animationDelay: "140ms" }}
      >
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
              const o =
                origin ??
                ({ lat: s.fromLat, lng: s.fromLng, label: s.fromLabel } as Point);
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
                    startPlannedItinerary(firstMileItin, origin, { lat: kapnos.pickup.lat, lng: kapnos.pickup.lng, label: kapnos.pickup.name });
                    return;
                  }
                  setDestination({ lat: kapnos.pickup.lat, lng: kapnos.pickup.lng, label: kapnos.pickup.name });
                  setActive(null);
                  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onPlanLastMile={() => {
                  if (lastMileItin && destination) {
                    startPlannedItinerary(lastMileItin, { lat: kapnos.dropoff.lat, lng: kapnos.dropoff.lng, label: kapnos.dropoff.name }, destination);
                    return;
                  }
                  setOrigin({ lat: kapnos.dropoff.lat, lng: kapnos.dropoff.lng, label: kapnos.dropoff.name });
                  setActive(null);
                  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
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
                  <p className="mt-1.5 text-[13px] text-ink-soft">
                    {t("trips.noRouteBody")}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {results && results.length > 0 && origin && destination && (
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
                    startPlannedItinerary(firstMileItin, origin, { lat: kapnos.pickup.lat, lng: kapnos.pickup.lng, label: kapnos.pickup.name });
                    return;
                  }
                  setDestination({ lat: kapnos.pickup.lat, lng: kapnos.pickup.lng, label: kapnos.pickup.name });
                  setActive(null);
                  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onPlanLastMile={() => {
                  if (lastMileItin && destination) {
                    startPlannedItinerary(lastMileItin, { lat: kapnos.dropoff.lat, lng: kapnos.dropoff.lng, label: kapnos.dropoff.name }, destination);
                    return;
                  }
                  setOrigin({ lat: kapnos.dropoff.lat, lng: kapnos.dropoff.lng, label: kapnos.dropoff.name });
                  setActive(null);
                  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
            {pnr && (
              <ParkAndRideCard suggestion={pnr} origin={{ lat: origin.lat, lng: origin.lng }} />
            )}
            {bikeShare && <BikeShareCard suggestion={bikeShare} />}
            {boltScooter && <BoltScooterCard suggestion={boltScooter} />}
            <ItineraryResults results={results} origin={origin} destination={destination} />
            {lastMileChain && <LastMileChainCard suggestion={lastMileChain} />}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function EmptyState({
  origin,
  destination,
}: {
  origin: Point | null;
  destination: Point | null;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-[28px] bg-card p-6 ring-1 ring-line">
      <p className="font-display text-lg text-ink leading-tight text-balance">
        {origin && !destination ? t("trips.emptyTitleA") : t("trips.emptyTitleB")}
      </p>
      <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">
        {t("trips.emptyBody")}
      </p>
    </div>
  );
}

function PersonalSuggestions({
  items,
  onPick,
}: {
  items: TripSuggestion[];
  onPick: (s: TripSuggestion) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((s) => {
        const shortLabel = s.toLabel.split(/[,—-]/)[0].trim();
        const len = shortLabel.length;
        const labelSize =
          len > 38
            ? "text-[13px]"
            : len > 28
              ? "text-[15px]"
              : len > 20
                ? "text-[16px]"
                : "text-[18px]";
        return (
          <button
            key={s.key}
            onClick={() => onPick(s)}
            className="group flex items-center gap-4 rounded-[24px] bg-card ring-1 ring-line px-5 py-4 text-left transition-colors hover:bg-limestone-soft/60 active:scale-[0.995]"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-aegean/15 ring-1 ring-aegean/30 font-display text-[18px] text-aegean-deep tabular-nums">
              {s.count > 9 ? "9+" : s.count}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`font-display ${labelSize} leading-[1.2] text-ink break-words [overflow-wrap:anywhere] line-clamp-2`}
                title={shortLabel}
              >
                {shortLabel}
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft truncate">
                {s.blurb}
              </p>
            </div>
            <IconArrowUpRight className="size-4 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        );
      })}
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        {t("trips.learnedFromPast")}
      </p>
    </div>
  );
}

function PlanningSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-28 rounded-3xl bg-card ring-1 ring-line animate-pulse"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

function FieldRow({
  role,
  label,
  point,
  active,
  onActivate,
  onClear,
}: {
  role: "from" | "to";
  label: string;
  point: Point | null;
  active: boolean;
  onActivate: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      onClick={onActivate}
      className={`group flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left transition-colors ${
        active ? "bg-limestone-soft" : "hover:bg-limestone-soft/60"
      }`}
    >
      <span
        className={`flex size-9 items-center justify-center rounded-full ring-1 ${
          role === "from"
            ? "bg-aegean-soft/60 text-aegean-deep ring-aegean-soft"
            : "bg-ochre-soft text-ochre ring-ochre-soft"
        }`}
      >
        {role === "from" ? (
          <span className="block size-2 rounded-full bg-current" />
        ) : (
          <IconPin className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[11px] font-semibold tracking-tight text-ink-soft">
          {label}
        </p>
        <p
          className={`truncate text-[15px] ${
            point ? "text-ink font-medium" : "text-ink-soft"
          }`}
        >
          {point?.label ?? (role === "from" ? t("trips.detecting") : t("trips.searchPlaceholder"))}
        </p>
      </div>
      {point && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="rounded-full bg-limestone-soft px-3 py-1.5 font-sans text-[11px] font-semibold tracking-tight text-ink-soft hover:bg-ink hover:text-limestone transition-colors"
        >
          {t("trips.clear")}
        </span>
      )}
    </button>
  );
}

function PlacesPicker({
  role,
  bias,
  onPick,
}: {
  role: "from" | "to";
  bias: { lat: number; lng: number };
  onPick: (p: Point, role: "from" | "to") => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { placeId: string; primary: string; secondary: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const acFn = useServerFn(autocompletePlaces);
  const placeFn = useServerFn(getPlace);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounce.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await acFn({ data: { query, bias } });
        setSuggestions(res.suggestions);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(debounce.current);
  }, [query, bias, acFn]);

  async function choose(placeId: string) {
    const place = await placeFn({ data: { placeId } });
    onPick(
      {
        lat: place.lat,
        lng: place.lng,
        label: place.name === place.address ? place.name : `${place.name}`,
      },
      role,
    );
  }

  return (
    <div className="mt-3 rounded-[24px] bg-card ring-1 ring-line overflow-hidden">
      <div className="relative flex items-center">
        <span className="absolute left-4 text-ink-soft">
          <IconSearch className="size-4" />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={role === "from" ? t("trips.fromWhere") : t("trips.whereTo")}
          className="w-full bg-transparent py-4 pl-11 pr-4 text-[15px] outline-none placeholder:text-ink-soft/60"
        />
        {loading && (
          <span className="absolute right-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {t("trips.searching")}
          </span>
        )}
      </div>
      {query.trim().length < 2 ? (
        <QuickPicks role={role} onChoose={(p) => onPick(p, role)} />
      ) : (
        suggestions.length > 0 && (
          <ul className="divide-y divide-line">
            {suggestions.slice(0, 6).map((s) => (
              <li key={s.placeId}>
                <button
                  onClick={() => choose(s.placeId)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-limestone-soft"
                >
                  <IconPin className="size-4 text-aegean-deep shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink">
                      {s.primary}
                    </p>
                    {s.secondary && (
                      <p className="truncate text-[11px] text-ink-soft">
                        {s.secondary}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

// Contextual glyph for a saved place based on its user-chosen label.
function labelGlyph(label: string) {
  const l = label.trim().toLowerCase();
  if (/(home|house|maison|σπίτι)/.test(l)) return IconHome;
  if (/(work|office|job|γραφεί)/.test(l)) return IconBriefcase;
  if (/(fav|love|star|heart|αγαπ)/.test(l)) return IconStar;
  return IconPin;
}

function QuickPicks({
  role,
  onChoose,
}: {
  role: "from" | "to";
  onChoose: (p: Point) => void;
}) {
  const { t } = useI18n();
  const saved = useSavedPlaces();
  const recents = useRecents();
  if (saved.length === 0 && recents.length === 0) return null;
  return (
    <div className="border-t border-line p-4 space-y-4">
      {saved.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-ink-soft">
            <IconPin className="size-3.5" strokeWidth={1.4} />
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-wrap gap-2">
            {saved.map((p) => {
              const Glyph = labelGlyph(p.label);
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    onChoose({ lat: p.lat, lng: p.lng, label: p.name })
                  }
                  className="group inline-flex items-center gap-2 rounded-full bg-limestone-soft px-3.5 py-2 text-[12px] text-ink transition-colors hover:bg-aegean-soft/60"
                  aria-label={`${p.label}: ${p.name}`}
                >
                  <Glyph className="size-3.5 text-aegean-deep" strokeWidth={1.4} />
                  <span>
                    {p.name.length > 24 ? `${p.name.slice(0, 24)}…` : p.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {recents.length > 0 && role === "to" && (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {t("trips.recent")}
          </div>
          <ul className="divide-y divide-line">
            {recents.slice(0, 5).map((r) => (
              <li key={r.id}>
                <button
                  onClick={() =>
                    onChoose({ lat: r.lat, lng: r.lng, label: r.name })
                  }
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <IconClock className="size-4 text-ink-soft shrink-0" />
                  <span className="truncate text-[13px] text-ink">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


// Bridge component: renders an Itinerary card and wires "Start this trip" to
// the existing single-ride trip companion. Multi-ride itineraries surface a
// disabled "Multi-leg tracking — Phase 4" affordance until the live-tracking
// rewrite lands.
function ItineraryRow({
  itinerary,
  highlight,
  origin,
  destination,
}: {
  itinerary: Itinerary;
  highlight: boolean;
  origin: Point;
  destination: Point;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const rides = itinerary.legs.filter((l): l is RideLeg => l.kind === "ride");
  const isSingleRide = rides.length === 1;

  function start() {
    // Single-ride: use the legacy JourneyOption path so the existing
    // single-leg companion + push pipeline keeps working byte-identically.
    // Multi-ride: also populate the full itinerary + legState so the
    // MultiLegCompanion picks it up at /trip/$id.
    const option = itineraryToJourneyOption(itinerary);
    if (!option) return;
    setActiveTrip({
      startedAt: Date.now(),
      option,
      from: origin,
      to: destination,
      itinerary: isSingleRide ? undefined : itinerary,
      legState: isSingleRide
        ? undefined
        : { currentLegIndex: 0, perLeg: { 0: { enteredAt: Date.now() } } },
    });
    void navigate({ to: "/trip/$id", params: { id: option.id } });
  }

  return (
    <div className="flex flex-col gap-2">
      <ItineraryCard
        itinerary={itinerary}
        highlight={highlight}
        onStart={start}
        startLabel={t("trips.startThis")}
      />
      <div className="px-1">
        <RemindMeButton
          itinerary={itinerary}
          origin={origin}
          destination={destination}
        />
      </div>
    </div>
  );
}

// Splits direct trips (free) from transfer trips (Pro). Renders all directs,
// then either renders transfers inline (Pro) or wraps them in a single
// ProGate that unlocks all multi-leg results at once.
function ItineraryResults({
  results,
  origin,
  destination,
}: {
  results: Itinerary[];
  origin: Point;
  destination: Point;
}) {
  const { t } = useI18n();
  const direct = results.filter((it) => it.transfers === 0);
  const transfers = results.filter((it) => it.transfers > 0);

  return (
    <div className="flex flex-col gap-3">
      {direct.map((it, i) => (
        <ItineraryRow
          key={`${it.id}-direct-${it.departureUnix}-${i}`}
          itinerary={it}
          highlight={i === 0 && direct.length > 0}
          origin={origin}
          destination={destination}
        />
      ))}
      {transfers.length > 0 && (
        <ProGate
          feature={transfers.length === 1 ? t("trips.fasterOne") : t("trips.fasterN", { n: transfers.length })}
          preview={
            <div className="flex flex-col gap-3 p-3">
              {transfers.slice(0, 2).map((it, i) => (
                <ItineraryRow
                  key={`${it.id}-transfer-preview-${it.departureUnix}-${i}`}
                  itinerary={it}
                  highlight={false}
                  origin={origin}
                  destination={destination}
                />
              ))}
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            {transfers.map((it, i) => (
              <ItineraryRow
                key={`${it.id}-transfer-${it.departureUnix}-${i}`}
                itinerary={it}
                highlight={direct.length === 0}
                origin={origin}
                destination={destination}
              />
            ))}
          </div>
        </ProGate>
      )}
    </div>
  );
}



// Map a single-ride Itinerary into the legacy JourneyOption shape that
// trip.$id and trip-store still expect. Drops Wait legs (they're implicit
// in the schedule). Phase 4 will replace this bridge with native multi-leg.
function itineraryToJourneyOption(it: Itinerary): JourneyOption | null {
  const ride = it.legs.find((l): l is RideLeg => l.kind === "ride");
  if (!ride) return null;
  const legs: JourneyOption["legs"] = [];
  for (const leg of it.legs) {
    if (leg.kind === "walk") {
      const w = leg as WalkLeg;
      legs.push({
        kind: "walk",
        from: { lat: w.from.lat, lng: w.from.lng, label: w.from.name },
        to: { lat: w.to.lat, lng: w.to.lng, label: w.to.name },
        durationSec: w.durationSec,
        distanceMeters: w.distanceMeters,
      });
    } else if (leg.kind === "ride") {
      legs.push({
        kind: "bus",
        routeId: leg.routeId,
        routeShort: leg.routeShort,
        routeLong: leg.routeLong,
        tripId: leg.tripId,
        board: {
          stopId: leg.board.stopId,
          name: leg.board.name,
          departureUnix: leg.board.departureUnix,
        },
        alight: {
          stopId: leg.alight.stopId,
          name: leg.alight.name,
          arrivalUnix: leg.alight.arrivalUnix,
        },
        delaySec: leg.delaySec,
        scheduled: !leg.live,
      });
    }
    // wait legs are dropped — companion derives waiting from board time
  }
  return {
    id: it.id,
    totalDurationSec: it.totalDurationSec,
    departureUnix: it.departureUnix,
    arrivalUnix: it.arrivalUnix,
    legs,
    transfers: it.transfers,
    scheduled: it.source !== "live",
  };
}

// ── Time intent chip ──────────────────────────────────────────────────────
// Surfaces a leave-by / arrive-by request from the NL planner so the user
// knows the trip search is honouring it, and can clear or flip it.

function TimeIntentChip({
  intent,
  onChange,
  onClear,
}: {
  intent: { leaveByISO: string | null; arriveByISO: string | null } | null;
  onChange: (i: { leaveByISO: string | null; arriveByISO: string | null }) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  if (!intent || (!intent.leaveByISO && !intent.arriveByISO)) return null;
  const iso = intent.arriveByISO ?? intent.leaveByISO!;
  const mode: "arrive" | "leave" = intent.arriveByISO ? "arrive" : "leave";
  const label = formatIntentLabel(iso, t);
  return (
    <div className="mt-3 flex items-center gap-2 rounded-full bg-aegean-soft/50 ring-1 ring-aegean-soft px-3 py-2">
      <IconClock className="size-3.5 text-aegean-deep shrink-0" />
      <button
        type="button"
        onClick={() =>
          onChange(
            mode === "arrive"
              ? { leaveByISO: iso, arriveByISO: null }
              : { leaveByISO: null, arriveByISO: iso },
          )
        }
        className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-aegean-deep hover:text-ink transition"
      >
        {mode === "arrive" ? t("trips.intentArriveBy") : t("trips.intentLeave")} {label}
      </button>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft hover:text-ink transition"
      >
        {t("trips.intentNow")}
      </button>
    </div>
  );
}

function formatIntentLabel(iso: string, t: (k: any, v?: any) => string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return time;
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return t("trips.intentTomorrow", { time });
    return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  } catch {
    return iso;
  }
}

function formatYYYYMMDD(s: string): string {
  if (!/^\d{8}$/.test(s)) return s;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  try {
    return new Date(Date.UTC(y, m, d)).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}
