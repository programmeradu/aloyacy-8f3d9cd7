// Everything the /pulse screen needs to read: coarse rider location, the daily
// briefing keyed to where they are (or where they are heading), the punctuality
// roll-up, the 24-hour strip and the live signal bundle.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPulseHourStrip } from "@/lib/pulse.functions";
import { getCrowdEyes } from "@/lib/crowd-coverage.server";
import { getPulseLive } from "@/lib/pulse-live.functions";
import { getTodayBriefing } from "@/lib/today.functions";
import { useActiveTrip } from "@/lib/trip-store";

/** ~1 km bucket, so every rider in a town shares one cache entry. */
const round = (n: number) => Math.round(n * 100) / 100;

/** One-shot coarse fix. Silent on denial — the island-wide briefing still works. */
function useCoarseCoords() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (cancelled) return;
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 5 * 60_000 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}

export function usePulseData() {
  const todayFn = useServerFn(getTodayBriefing);
  const hourFn = useServerFn(getPulseHourStrip);
  const eyesFn = useServerFn(getCrowdEyes);
  const pulseLiveFn = useServerFn(getPulseLive);

  const active = useActiveTrip();
  const coords = useCoarseCoords();

  // Trip destination takes precedence over the current fix: a rider on the way
  // to Larnaca cares about Larnaca's day, not the one they are leaving behind.
  const briefingInput = useMemo(() => {
    const dest = active?.to;
    return {
      lat: coords ? round(coords.lat) : undefined,
      lng: coords ? round(coords.lng) : undefined,
      destLat: dest ? round(dest.lat) : undefined,
      destLng: dest ? round(dest.lng) : undefined,
    };
  }, [coords, active?.to]);

  const { data: today } = useQuery({
    queryKey: ["today-briefing", briefingInput],
    queryFn: () => todayFn({ data: briefingInput }),
    refetchInterval: 10 * 60_000,
    staleTime: 9 * 60_000,
  });

  const { data: hourly } = useQuery({
    queryKey: ["pulse-hourly"],
    queryFn: () => hourFn(),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const { data: crowdEyes } = useQuery({
    queryKey: ["pulse-crowd-eyes"],
    queryFn: () => eyesFn(),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const liveSignalsInput = useMemo(
    () => ({ lat: briefingInput.lat, lng: briefingInput.lng }),
    [briefingInput.lat, briefingInput.lng],
  );

  const { data: liveSignals } = useQuery({
    queryKey: ["pulse-live-signals", liveSignalsInput],
    queryFn: () => pulseLiveFn({ data: liveSignalsInput }),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  return { today, hourly, crowdEyes, liveSignals };
}
