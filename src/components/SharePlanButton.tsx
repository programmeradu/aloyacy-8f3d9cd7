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

  const sub =
    state === "shared" && url
      ? url.replace(/^https?:\/\//, "")
      : state === "error"
        ? "Something went wrong — tap to retry"
        : "Meeting stop, bus, time — one link";

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={state === "creating"}
      className="group flex h-full w-full items-center gap-3 rounded-2xl bg-card ring-1 ring-line px-4 py-3 text-left transition-colors hover:bg-limestone-soft disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-limestone-soft ring-1 ring-line">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 text-ink"
          aria-hidden
        >
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v14" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[14px] font-semibold text-ink leading-tight">
          {label}
        </span>
        <span
          className={`mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] ${state === "error" ? "text-ochre" : "text-ink-soft"}`}
        >
          {sub}
        </span>
      </span>
      <span className="font-mono text-[16px] text-ink-soft leading-none transition-transform group-hover:translate-x-0.5">
        ›
      </span>
    </button>
  );
}
