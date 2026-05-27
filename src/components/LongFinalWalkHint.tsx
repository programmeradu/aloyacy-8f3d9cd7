// Conversational hint shown when the rider's final walk to their destination
// is unusually long (≥ ~1.2 km). We keep this minimal and personalized:
// one sentence that reflects the actual distance, time of day, and weather-
// ish feel, plus a single action — open the walk in Google Maps. We do NOT
// link out to a "find a taxi" search: Google Maps doesn't surface Cyprus
// taxis, and without a real local taxi deeplink/number the button would
// just dead-end the rider. Taxi guidance will return once we have a proper
// Cyprus integration.

import { useEffect, useMemo } from "react";
import { IconArrowUpRight } from "@/components/Icons";
import { track } from "@/lib/analytics";

type LatLng = { lat: number; lng: number };

const LONG_WALK_THRESHOLD_M = 1200;

function buildLine(distanceM: number, durationSec: number, dest?: string) {
  const km = distanceM / 1000;
  const min = Math.max(1, Math.round(durationSec / 60));
  const hour = new Date().getHours();
  const where = dest ? `to ${dest}` : "to your destination";

  // Tiered, personalized phrasing — no two riders see the same generic line.
  if (km >= 2.5) {
    return `That's a real hike ${where} — about ${min} min on foot from here. No bus gets closer, so take it slow or save it for another time.`;
  }
  if (km >= 1.8) {
    if (hour >= 21 || hour < 6) {
      return `Around ${min} min walking ${where}, and it's getting late. The route's below if you'd like to follow it.`;
    }
    return `You're about ${min} min on foot ${where} — a proper walk. Stretch out and follow the route below.`;
  }
  if (hour >= 12 && hour < 16) {
    return `Roughly ${min} min walking ${where}. Bit warm out — take water if you have it. Turn-by-turn is just below.`;
  }
  if (hour >= 21 || hour < 6) {
    return `About ${min} min walking ${where} from here. Quiet streets at this hour — the route's below.`;
  }
  return `About ${min} min walking ${where} from here — no bus gets closer. The turn-by-turn is just below.`;
}

export function LongFinalWalkHint({
  from,
  to,
  distanceMeters,
  durationSec,
  destinationLabel,
}: {
  from: LatLng;
  to: LatLng;
  distanceMeters: number;
  durationSec: number;
  destinationLabel?: string;
  className?: string;
}) {
  const show = distanceMeters >= LONG_WALK_THRESHOLD_M;

  useEffect(() => {
    if (show) {
      track("ui:long_final_walk_shown", {
        distance_m: Math.round(distanceMeters),
        duration_min: Math.round(durationSec / 60),
      });
    }
  }, [show, distanceMeters, durationSec]);

  const line = useMemo(
    () => buildLine(distanceMeters, durationSec, destinationLabel),
    [distanceMeters, durationSec, destinationLabel],
  );

  if (!show) return null;

  const km = (distanceMeters / 1000).toFixed(1);
  const walkingUrl = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=walking`;

  return (
    <section className="px-6 mt-3 animate-rise">
      <article className="rounded-[26px] bg-ochre-soft/55 ring-1 ring-ochre/30 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
          Last stretch — long on foot
        </p>
        <h3 className="mt-1.5 font-display text-[22px] leading-[1.15] text-ink text-balance">
          Roughly <span className="text-ochre">{km} km</span> left
          {destinationLabel ? <> to {destinationLabel}</> : null}.
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{line}</p>
        <div className="mt-3">
          <a
            href={walkingUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              track("ui:long_final_walk_maps_tap", {
                distance_m: Math.round(distanceMeters),
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12px] text-limestone hover:bg-ink/90"
          >
            Open walk in Google Maps
            <IconArrowUpRight className="size-3.5" />
          </a>
        </div>
      </article>
    </section>
  );
}
