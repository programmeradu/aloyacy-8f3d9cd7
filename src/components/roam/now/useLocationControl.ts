// Location for Now: the shared geolocation hook, a manual re-ask from the
// card, and the browser permission state (moved out of the Sky home as is).
import { useCallback, useEffect, useState } from "react";

const GEO_KEY = "aloya:geo";
type Coords = { lat: number; lng: number };

export function useLocationControl(hookCoords: Coords, hookSource: "live" | "cached" | "fallback") {
  const [override, setOverride] = useState<Coords | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        status = s;
        setDenied(s.state === "denied");
        s.onchange = () => setDenied(s.state === "denied");
      })
      .catch(() => {});
    return () => {
      if (status) status.onchange = null;
    };
  }, []);
  const ask = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          localStorage.setItem(GEO_KEY, JSON.stringify({ ...c, ts: Date.now() }));
        } catch {}
        setOverride(c);
      },
      (err) => setDenied(err.code === err.PERMISSION_DENIED),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);
  return {
    coords: override ?? hookCoords,
    source: override ? ("live" as const) : hookSource,
    override,
    denied,
    ask,
  };
}
