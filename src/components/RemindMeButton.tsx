// "Remind me to leave" — schedules a server-side push reminder a few
// minutes before the rider needs to start walking to make this trip.
// Shown only when the trip departs at least 20 min from now.

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/itinerary-types";
import { useAuth } from "@/lib/useAuth";
import { AuthSheet } from "@/components/AuthSheet";
import { scheduleDeparture } from "@/lib/scheduled-departures.functions";
import { IconClock } from "@/components/Icons";
import { useProPaywall } from "@/lib/useProPaywall";
import { track, trackImpression } from "@/lib/analytics";
import { useI18n } from "@/lib/i18n";


export function RemindMeButton({
  itinerary,
  origin,
  destination,
}: {
  itinerary: Itinerary;
  origin: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const schedule = useServerFn(scheduleDeparture);
  const { isPro, requirePro } = useProPaywall();
  // Stable signature so a "saved" reminder stays marked saved even after the
  // planner refetches and remounts this card with a new itinerary.id.
  const firstRide = itinerary.legs.find(
    (l): l is RideLeg => l.kind === "ride",
  );
  const sigKey = `aloya:remind:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}@${firstRide?.routeId ?? "x"}:${Math.round(itinerary.departureUnix / 60)}`;
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    () => {
      if (typeof window === "undefined") return "idle";
      try {
        const raw = window.localStorage.getItem(sigKey);
        if (!raw) return "idle";
        const savedUntil = Number(raw);
        return Number.isFinite(savedUntil) && savedUntil * 1000 > Date.now()
          ? "saved"
          : "idle";
      } catch {
        return "idle";
      }
    },
  );
  const [authOpen, setAuthOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const departIn = Math.round((itinerary.departureUnix - Date.now() / 1000) / 60);
  useEffect(() => {
    if (departIn >= 20) {
      trackImpression("ui:remind-me.impression", { isPro, departIn });
    }
  }, [departIn, isPro]);
  if (departIn < 20) return null;

  // How long the rider needs before bus departure (first walk leg + 3 min buffer)
  const firstWalk = itinerary.legs.find((l): l is WalkLeg => l.kind === "walk");
  const walkSec = firstWalk?.durationSec ?? 5 * 60;
  // Remind 5 min before the rider should actually leave
  const remindAtUnix = itinerary.departureUnix - walkSec - 5 * 60;

  async function doSchedule() {
    setState("saving");
    setErr(null);
    try {
      await schedule({
        data: {
          arriveByUnix: itinerary.arrivalUnix,
          remindAtUnix,
          plan: {
            fromLabel: origin.label,
            toLabel: destination.label,
            fromLat: origin.lat,
            fromLng: origin.lng,
            toLat: destination.lat,
            toLng: destination.lng,
            leaveByUnix: itinerary.departureUnix - walkSec,
            legs: itinerary.legs.map((l) => {
              if (l.kind === "ride") {
                const r = l as RideLeg;
                return {
                  kind: "ride",
                  routeId: r.routeId,
                  routeShort: r.routeShort,
                  durationSec: Math.max(0, r.alight.arrivalUnix - r.board.departureUnix),
                };
              }
              if (l.kind === "walk") {
                return { kind: "walk", durationSec: l.durationSec };
              }
              return { kind: l.kind };
            }),
          },
        },
      });
      setState("saved");
      try {
        window.localStorage.setItem(sigKey, String(itinerary.departureUnix));
      } catch {}
      track("ui:remind-me.saved", { departIn });
    } catch (e) {
      track("ui:remind-me.error");
      setErr(e instanceof Error ? e.message : t("remind.error"));
      setState("error");
    }
  }

  function handleClick() {
    track("ui:remind-me.tap", { isPro, departIn });
    if (!user) {
      setAuthOpen(true);
      return;
    }
    requirePro(() => {
      void doSchedule();
    });
  }

  const label =
    state === "saved"
      ? t("remind.set")
      : state === "saving"
        ? t("remind.saving")
        : isPro
          ? t("remind.cta")
          : t("remind.ctaPro");

  const sub = err
    ? err
    : state === "saved"
      ? t("remind.foot")
      : `In ${departIn} min · we'll ping 5 min before you leave`;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "saving" || state === "saved"}
        className="group flex h-full w-full items-center gap-3 rounded-2xl bg-card ring-1 ring-line px-4 py-3 text-left transition-colors hover:bg-limestone-soft disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-limestone-soft ring-1 ring-line">
          <IconClock className="size-4 text-ink" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-[14px] font-semibold text-ink leading-tight">
            {label}
          </span>
          <span
            className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] ${err ? "text-ochre" : "text-ink-soft"}`}
          >
            {sub}
          </span>
        </span>
        <span className="font-mono text-[16px] text-ink-soft leading-none transition-transform group-hover:translate-x-0.5">
          ›
        </span>
      </button>
      <AuthSheet
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title={t("remind.authTitle")}
        subtitle={t("remind.authSubtitle")}
      />
    </>
  );
}
