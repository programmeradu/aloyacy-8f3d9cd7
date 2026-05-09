// "Share plan" — snapshots a planned trip to a public /plan/:token page
// so a group can coordinate before anyone leaves (meeting stop, bus,
// departure time). Uses Web Share API when available, falls back to
// copy-to-clipboard. Distinct from live ETA sharing (in-trip).

import { useState } from "react";
import type { Itinerary } from "@/lib/itinerary-types";
import { useI18n } from "@/lib/i18n";

type Point = { lat: number; lng: number; label: string };

export function SharePlanButton({
  itinerary,
  origin,
  destination,
}: {
  itinerary: Itinerary;
  origin: Point;
  destination: Point;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "creating" | "shared" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);

  async function onShare() {
    if (state === "creating") return;
    setState("creating");
    try {
      const res = await fetch("/api/public/plan-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originLabel: origin.label,
          originLat: origin.lat,
          originLng: origin.lng,
          destinationLabel: destination.label,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          departureUnix: Math.floor(itinerary.departureUnix),
          arrivalUnix: Math.floor(itinerary.arrivalUnix),
          totalDurationSec: Math.floor(itinerary.totalDurationSec),
          transfers: itinerary.transfers,
          legs: itinerary.legs,
        }),
      });
      if (!res.ok) throw new Error(`share ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      const shareUrl = `${window.location.origin}/plan/${token}`;
      setUrl(shareUrl);

      const shareData = {
        title: t("share.plan.title"),
        text: t("share.plan.text", { where: destination.label }),
        url: shareUrl,
      };
      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share(shareData);
          setState("shared");
          return;
        } catch {
          // user cancelled — fall through to copy
        }
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch {
          // ignore
        }
      }
      setState("shared");
    } catch {
      setState("error");
    }
  }

  const label =
    state === "creating"
      ? t("share.plan.creating")
      : state === "shared"
        ? t("share.plan.copied")
        : state === "error"
          ? t("share.plan.retry")
          : t("share.plan.cta");

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onShare}
        disabled={state === "creating"}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-limestone-soft px-4 py-2 font-sans text-[13px] font-semibold text-ink ring-1 ring-line transition-colors hover:bg-limestone-soft/70 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v14" />
        </svg>
        {label}
      </button>
      {state === "shared" && url && (
        <p className="px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft break-all">
          {url.replace(/^https?:\/\//, "")}
        </p>
      )}
    </div>
  );
}
