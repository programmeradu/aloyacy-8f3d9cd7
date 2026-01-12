// Renders the current disruption signal as an editorial banner with a
// re-plan CTA when applicable. Stays out of the way (returns null) when
// there's no signal.

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { DisruptionSignal } from "@/lib/useDisruptionWatch";
import { track, trackImpression } from "@/lib/analytics";
import { IconArrowUpRight } from "./Icons";

export function DisruptionBanner({
  signal,
  onReplan,
}: {
  signal: DisruptionSignal | null;
  onReplan?: () => void;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    if (signal) {
      trackImpression(
        "ui:disruption.impression",
        { kind: signal.kind, suggestReplan: !!signal.suggestReplan },
        `disruption:${signal.kind}`,
      );
    }
  }, [signal]);
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
    track("ui:disruption.replan-tap", { kind: signal.kind });
    if (onReplan) {
      onReplan();
      return;
    }
    void navigate({ to: "/trips" });
  };

  return (
    <section className="px-6 mt-3 animate-rise">
      <div className={`rounded-[24px] px-5 py-4 ${palette.wrap}`}>
        <p
          className={`font-sans text-[11px] font-semibold uppercase tracking-[0.16em] ${palette.eyebrow}`}
        >
          {labelFor(signal.kind)}
        </p>
        <p className="mt-1.5 font-display text-[20px] font-semibold leading-tight tracking-tight text-ink">
          {signal.title}
        </p>
        <p className="mt-1 font-sans text-[13.5px] leading-relaxed text-ink-soft">
          {signal.body}
        </p>
        {signal.suggestReplan && (
          <button
            type="button"
            onClick={handleReplan}
            className="mt-3.5 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 font-sans text-[13px] font-semibold tracking-tight text-limestone"
          >
            Find a faster route
            <IconArrowUpRight className="size-3.5" />
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
