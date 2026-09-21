// Surfaces the rider's top learned commute pattern as a one-tap
// suggestion on the home screen. Hidden when no pattern qualifies
// (fewer than 2 trips on the signature, or wrong time of day).
//
// Free  — static suggestion. Tap to open the planner with the trip
//         intent pre-filled.
// Pro   — auto-warms the trip: prefetches the top live itinerary so
//         the card shows the next bus + ETA inline, refreshed every
//         60 s. Tap behavior is unchanged.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { getTopCommuteSuggestion } from "@/lib/commute-learner.functions";
import { planMultiLeg } from "@/lib/multileg.functions";
import { useAuth } from "@/lib/useAuth";
import { track, trackImpression } from "@/lib/analytics";
import { IconArrowUpRight } from "@/components/Icons";

export function CommuteSuggestionCard() {
  const fn = useServerFn(getTopCommuteSuggestion);
  const plan = useServerFn(planMultiLeg);
  const nav = useNavigate();
  const { session } = useAuth();

  const { data } = useQuery({
    enabled: !!session,
    queryKey: ["commute-suggestion", session?.user?.id ?? null],
    queryFn: () => fn({}),
    staleTime: 5 * 60_000,
  });
  const s = data?.suggestion;

  // Auto-warm: prefetch the top live itinerary so the card
  // can render "Bus 30 · 12 min" without an extra tap.
  const { data: preview } = useQuery({
    enabled: !!s,
    queryKey: ["commute-preview", s?.fromLat, s?.fromLng, s?.toLat, s?.toLng],
    queryFn: () =>
      plan({
        data: {
          from: { lat: s!.fromLat, lng: s!.fromLng, label: s!.fromLabel },
          to: { lat: s!.toLat, lng: s!.toLng, label: s!.toLabel },
          mode: "live",
        },
      }),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (s) {
      trackImpression(
        "ui:commute-card.impression",
        { hasPreview: !!preview?.itineraries?.length },
        `commute:${s.fromLabel}->${s.toLabel}`,
      );
    }
  }, [s, preview]);

  if (!s) return null;

  const top = preview?.itineraries?.[0];
  const firstRide = top?.legs.find((l) => l.kind === "ride");
  const minsToBoard = firstRide
    ? Math.max(0, Math.round((firstRide.board.departureUnix - Date.now() / 1000) / 60))
    : null;

  return (
    <button
      type="button"
      onClick={() => {
        track("ui:commute-card.tap", { hasPreview: !!top });
        try {
          sessionStorage.setItem(
            "aloya:nl-plan",
            JSON.stringify({
              from: { label: s.fromLabel, lat: s.fromLat, lng: s.fromLng },
              to: { label: s.toLabel, lat: s.toLat, lng: s.toLng },
              leaveByISO: null,
              arriveByISO: null,
              rawText: `${s.fromLabel} to ${s.toLabel}`,
            }),
          );
        } catch {}
        nav({ to: "/trips" });
      }}
      className="w-full text-left rounded-[26px] bg-aegean-soft/40 ring-1 ring-aegean/20 px-5 py-4 hover:bg-aegean-soft/60 transition-colors"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
        Your usual trip · {s.usualTime}
      </p>
      <p className="mt-2 font-display text-[22px] leading-tight text-ink">
        {s.fromLabel}
        <span className="text-ink-soft"> to </span>
        {s.toLabel}
      </p>

      {firstRide && minsToBoard !== null ? (
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegean-deep">
            Bus {firstRide.routeShort}
            <span className="text-ink-soft">
              {" · "}
              {minsToBoard === 0 ? "leaving now" : `in ${minsToBoard} min`}
            </span>
          </p>
          <IconArrowUpRight className="size-4 text-aegean-deep" />
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Tap to plan now
          </p>
          <IconArrowUpRight className="size-4 text-aegean-deep" />
        </div>
      )}
    </button>
  );
}
