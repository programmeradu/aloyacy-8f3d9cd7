// Renders the current disruption signal as an editorial banner with a
// re-plan CTA when applicable. Stays out of the way (returns null) when
// there's no signal.

import { useNavigate } from "@tanstack/react-router";
import type { DisruptionSignal } from "@/lib/useDisruptionWatch";
import { IconArrowUpRight } from "./Icons";

export function DisruptionBanner({
  signal,
  onReplan,
}: {
  signal: DisruptionSignal | null;
  onReplan?: () => void;
}) {
  const navigate = useNavigate();
  if (!signal) return null;

  const palette = signal.kind === "vehicle-lost-feed"
    ? {
        wrap: "bg-limestone-soft ring-1 ring-line",
        eyebrow: "text-ink-soft",
      }
    : signal.kind === "missed-connection"
      ? {
          wrap: "bg-ochre-soft ring-1 ring-ochre/40",
          eyebrow: "text-ochre",
        }
      : signal.kind === "connection-at-risk"
        ? {
            wrap: "bg-ochre-soft/60 ring-1 ring-ochre/30",
            eyebrow: "text-ochre",
          }
        : {
            wrap: "bg-aegean-soft/50 ring-1 ring-aegean/30",
            eyebrow: "text-aegean-deep",
          };

  const handleReplan = () => {
    if (onReplan) {
      onReplan();
      return;
    }
    void navigate({ to: "/trips" });
  };

  return (
    <section className="px-6 mt-3 animate-rise">
      <div className={`rounded-[22px] px-4 py-3 ${palette.wrap}`}>
        <p
          className={`font-mono text-[10px] uppercase tracking-[0.22em] ${palette.eyebrow}`}
        >
          {labelFor(signal.kind)}
        </p>
        <p className="mt-1 font-display text-[18px] leading-snug text-ink">
          {signal.title}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-soft">{signal.body}</p>
        {signal.suggestReplan && (
          <button
            type="button"
            onClick={handleReplan}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12px] text-limestone"
          >
            Find a faster route
            <IconArrowUpRight className="size-3" />
          </button>
        )}
      </div>
    </section>
  );
}

function labelFor(kind: DisruptionSignal["kind"]): string {
  switch (kind) {
    case "running-late":
      return "Heads up";
    case "connection-at-risk":
      return "Tight connection";
    case "missed-connection":
      return "Plan B";
    case "vehicle-lost-feed":
      return "Tracking";
  }
}
