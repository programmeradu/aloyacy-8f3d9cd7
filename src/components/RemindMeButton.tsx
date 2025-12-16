// "Remind me to leave" — schedules a server-side push reminder a few
// minutes before the rider needs to start walking to make this trip.
// Shown only when the trip departs at least 20 min from now.

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/itinerary-types";
import { useAuth } from "@/lib/useAuth";
import { AuthSheet } from "@/components/AuthSheet";
import { scheduleDeparture } from "@/lib/scheduled-departures.functions";
import { IconClock } from "@/components/Icons";
import { useProPaywall } from "@/lib/useProPaywall";


export function RemindMeButton({
  itinerary,
  origin,
  destination,
}: {
  itinerary: Itinerary;
  origin: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
}) {
  const { user } = useAuth();
  const schedule = useServerFn(scheduleDeparture);
  const { isPro, requirePro, paywall } = useProPaywall();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [authOpen, setAuthOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const departIn = Math.round((itinerary.departureUnix - Date.now() / 1000) / 60);
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not schedule reminder");
      setState("error");
    }
  }

  return (
    <>
      <button
        onClick={onClick}
        disabled={state === "saving" || state === "saved"}
        className="inline-flex items-center gap-2 rounded-full bg-card ring-1 ring-line px-4 py-2 text-[12px] text-ink hover:bg-limestone-soft disabled:opacity-70"
      >
        <IconClock className="size-3.5" />
        {state === "saved"
          ? "Reminder set"
          : state === "saving"
            ? "Saving…"
            : "Remind me to leave"}
      </button>
      {state === "saved" && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          We'll re-check weather &amp; traffic and ping you a little earlier if needed.
        </p>
      )}
      {err && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ochre">
          {err}
        </p>
      )}
      <AuthSheet
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Sign in to save reminders"
        subtitle="We'll buzz you when it's time to head out."
      />
    </>
  );
}
