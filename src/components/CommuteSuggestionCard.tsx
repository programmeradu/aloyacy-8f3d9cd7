// Surfaces the rider's top learned commute pattern as a one-tap
// suggestion on the home screen. Hidden when no pattern qualifies
// (fewer than 2 trips on the signature, or wrong time of day).

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { getTopCommuteSuggestion } from "@/lib/commute-learner.functions";
import { IconArrowUpRight } from "@/components/Icons";

export function CommuteSuggestionCard() {
  const fn = useServerFn(getTopCommuteSuggestion);
  const nav = useNavigate();
  const { data } = useQuery({
    queryKey: ["commute-suggestion"],
    queryFn: () => fn({}),
    staleTime: 5 * 60_000,
  });
  const s = data?.suggestion;
  if (!s) return null;

  return (
    <button
      type="button"
      onClick={() => {
        try {
          sessionStorage.setItem(
            "aloya:nl-intent",
            JSON.stringify({
              from: { label: s.fromLabel, lat: s.fromLat, lng: s.fromLng },
              to: { label: s.toLabel, lat: s.toLat, lng: s.toLng },
              source: "commute-learner",
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
      <div className="mt-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          Tap to plan now
        </p>
        <IconArrowUpRight className="size-4 text-aegean-deep" />
      </div>
    </button>
  );
}
