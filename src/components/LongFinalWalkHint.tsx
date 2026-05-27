// Conversational hint shown when the rider's final walk to their destination
// is unusually long (≥ ~1.2 km). We don't deeplink any specific ride-hail
// app — instead we tell the rider what's happening in plain language and
// give them two clean options: hail a taxi (via Google Maps' "taxi near
// me" search, which works on every device without a partner API), or open
// the turn-by-turn route in Google Maps. The detailed in-app turn-by-turn
// is already rendered just below this hint.

import { useEffect } from "react";
import { IconArrowUpRight } from "@/components/Icons";
import { track } from "@/lib/analytics";

type LatLng = { lat: number; lng: number };

const LONG_WALK_THRESHOLD_M = 1200;

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

  if (!show) return null;

  const km = (distanceMeters / 1000).toFixed(1);
  const min = Math.max(1, Math.round(durationSec / 60));

  // Universal Google Maps URLs — open in the user's installed Maps app on
  // mobile, in maps.google.com on desktop. No API key, no partner contract.
  const walkingUrl = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=walking`;
  const taxiSearchUrl = `https://www.google.com/maps/search/taxi/@${from.lat},${from.lng},15z`;

  return (
    <section className="px-6 mt-3 animate-rise">
      <article className="rounded-[26px] bg-ochre-soft/55 ring-1 ring-ochre/30 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
          Last stretch — long on foot
        </p>
        <h3 className="mt-1.5 font-display text-[22px] leading-[1.15] text-ink text-balance">
          Roughly{" "}
          <span className="text-ochre">
            {km} km
          </span>{" "}
          to {destinationLabel ?? "your destination"}.
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          No bus gets you closer. About {min} min walking — if you'd rather
          not, a taxi from here is usually the easiest call. Otherwise the
          turn-by-turn is just below.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={taxiSearchUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              track("ui:long_final_walk_taxi_tap", {
                distance_m: Math.round(distanceMeters),
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12px] text-limestone hover:bg-ink/90"
          >
            Find a taxi nearby
            <IconArrowUpRight className="size-3.5" />
          </a>
          <a
            href={walkingUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              track("ui:long_final_walk_maps_tap", {
                distance_m: Math.round(distanceMeters),
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full bg-card ring-1 ring-line px-4 py-2 text-[12px] text-ink hover:bg-limestone-soft"
          >
            Open walk in Google Maps
            <IconArrowUpRight className="size-3.5" />
          </a>
        </div>
      </article>
    </section>
  );
}
