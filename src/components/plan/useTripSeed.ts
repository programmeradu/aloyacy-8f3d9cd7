// Owns the trip screen's four pieces of intent state (origin, destination,
// which field is open, and the time intent) plus the three ways they get
// seeded on arrival: a shared deep link, a hand-off from the Ask Aloya
// composer, and the rider's own location.
//
// Extracted from src/routes/trips.tsx so the route renders and this decides.

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { parseSharedPlan } from "@aloya/core/plan-signals";
import { reverseLookup } from "@/lib/maps.functions";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import { pushRecent } from "@/lib/trip-store";
import type { Point, TimeIntent } from "@/lib/plan-types";

const GEO_CACHE_KEY = "aloya:geo";
const NL_PLAN_KEY = "aloya:nl-plan";
/** Only fall back to the city centre once the browser has had a fair go. */
const GEO_FALLBACK_MS = 12_000;

export type TripSeed = {
  origin: Point | null;
  destination: Point | null;
  active: "from" | "to" | null;
  timeIntent: TimeIntent | null;
  setOrigin: (p: Point | null) => void;
  setDestination: (p: Point | null) => void;
  setActive: (a: "from" | "to" | null) => void;
  setTimeIntent: (t: TimeIntent | null) => void;
};

export function useTripSeed(): TripSeed {
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [active, setActive] = useState<"from" | "to" | null>(null);
  const [timeIntent, setTimeIntent] = useState<TimeIntent | null>(null);

  const reverseFn = useServerFn(reverseLookup);

  // 1) Shared plan deep link (/plan/:token → "Open this plan in Aloya").
  const hydratedFromUrlRef = useRef(false);
  useEffect(() => {
    if (hydratedFromUrlRef.current || typeof window === "undefined") return;
    const shared = parseSharedPlan(window.location.search, Date.now());
    if (!shared) return;
    hydratedFromUrlRef.current = true;
    setDestination(shared.destination);
    if (shared.origin) setOrigin(shared.origin);
    if (shared.leaveByISO) setTimeIntent({ leaveByISO: shared.leaveByISO, arriveByISO: null });
    if (shared.focus) setActive(shared.focus);
    // Clean the URL so a refresh reads as a plain /trips visit.
    window.history.replaceState({}, "", "/trips");
  }, []);

  // 2) Hand-off from the NL planner / learned-commute cards. Flagged
  //    synchronously so the geolocation effect below (same mount, next tick)
  //    never overwrites an origin the rider explicitly asked for.
  const consumedNlPlanRef = useRef(false);
  const nlSeededOriginRef = useRef(false);
  useEffect(() => {
    if (consumedNlPlanRef.current || typeof window === "undefined") return;
    consumedNlPlanRef.current = true;
    try {
      const raw = sessionStorage.getItem(NL_PLAN_KEY);
      if (!raw) return;
      sessionStorage.removeItem(NL_PLAN_KEY);
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
    } catch {
      // A malformed hand-off must never block the planner.
    }
  }, []);

  // 3) Geolocation: instant seed from the cached fix the home screen wrote,
  //    refined by a live fix, city centre only after a hard failure.
  useEffect(() => {
    if (origin || nlSeededOriginRef.current || typeof window === "undefined") return;
    let cancelled = false;

    const applyFix = async (lat: number, lng: number) => {
      if (cancelled) return;
      // Optimistic label so the UI unlocks before reverse-geocoding lands.
      setOrigin({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
      try {
        const { address } = await reverseFn({ data: { lat, lng } });
        if (!cancelled) setOrigin({ lat, lng, label: address });
      } catch {
        // Keep the coordinate label rather than blanking the field.
      }
    };

    const fallbackToCentre = () =>
      setOrigin(
        (cur) => cur ?? { lat: NICOSIA_CENTER.lat, lng: NICOSIA_CENTER.lng, label: "Nicosia centre" },
      );

    try {
      const raw = localStorage.getItem(GEO_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { lat: number; lng: number };
        if (Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lng)) {
          void applyFix(parsed.lat, parsed.lng);
        }
      }
    } catch {
      // Corrupt cache — the live fix below still runs.
    }

    if (!("geolocation" in navigator)) return;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) fallbackToCentre();
    }, GEO_FALLBACK_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(fallbackTimer);
        const { latitude, longitude } = pos.coords;
        try {
          localStorage.setItem(
            GEO_CACHE_KEY,
            JSON.stringify({ lat: latitude, lng: longitude, ts: Date.now() }),
          );
        } catch {
          // Private mode — the fix still applies for this session.
        }
        void applyFix(latitude, longitude);
      },
      () => {
        window.clearTimeout(fallbackTimer);
        if (!cancelled) fallbackToCentre();
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    origin,
    destination,
    active,
    timeIntent,
    setOrigin,
    setDestination,
    setActive,
    setTimeIntent,
  };
}
