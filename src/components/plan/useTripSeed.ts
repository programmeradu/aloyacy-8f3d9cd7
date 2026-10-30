// Owns the trip screen's four pieces of intent state (origin, destination,
// which field is open, and the time intent) plus the three ways they get
// seeded on arrival: a shared deep link, a hand-off from the Ask Aloya
// composer, and the rider's own location.
//
// Extracted from src/routes/trips.tsx so the route renders and this decides.

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSharedPlan } from "@aloya/core/plan-signals";
import { useRoamI18n } from "@/lib/roam-i18n";
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
  const [origin, setOriginState] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [active, setActive] = useState<"from" | "to" | null>(null);
  const [timeIntent, setTimeIntent] = useState<TimeIntent | null>(null);

  // The device-location origin reads "Your location" in the rider's language.
  // A reverse-geocoded street came back in Greek even in English, and the
  // rider knows where they are standing anyway.
  const { r } = useRoamI18n();
  const hereLabelRef = useRef(r("go.yourLocation"));
  hereLabelRef.current = r("go.yourLocation");

  // Set (synchronously, before the geolocation effect runs in the same
  // commit) whenever an origin is given explicitly: by a deep link, by the
  // Ask Aloya hand-off, or by the rider picking/clearing one. The device
  // location only ever fills an origin nobody chose, and never replaces one,
  // including when its reverse-geocode or live fix lands later.
  const explicitOriginRef = useRef(false);
  const setOrigin = useCallback((p: Point | null) => {
    explicitOriginRef.current = true;
    setOriginState(p);
  }, []);

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

  // 2) Hand-off from the NL planner / learned-commute cards. setOrigin flags
  //    the origin as explicit synchronously, so the geolocation effect below
  //    (same mount) never overwrites an origin the rider asked for.
  const consumedNlPlanRef = useRef(false);
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
  //    refined by a live fix, city centre only after a hard failure. Every
  //    write re-checks explicitOriginRef: a GPS fix or reverse-geocode that
  //    lands after the rider (or a link) set the origin is dropped.
  useEffect(() => {
    if (origin || explicitOriginRef.current || typeof window === "undefined") return;
    let cancelled = false;
    const gpsMayWrite = () => !cancelled && !explicitOriginRef.current;

    const applyFix = async (lat: number, lng: number) => {
      if (!gpsMayWrite()) return;
      setOriginState({ lat, lng, label: hereLabelRef.current });
    };

    const fallbackToCentre = () => {
      if (!gpsMayWrite()) return;
      setOriginState(
        (cur) =>
          cur ?? { lat: NICOSIA_CENTER.lat, lng: NICOSIA_CENTER.lng, label: "Nicosia centre" },
      );
    };

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
    const fallbackTimer = window.setTimeout(fallbackToCentre, GEO_FALLBACK_MS);

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
        fallbackToCentre();
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
