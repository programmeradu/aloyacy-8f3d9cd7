// Bridges the group into the planner: resumes an in-progress trip when it's
// already heading to the meetup point, otherwise sends the rider to /trips
// pre-filled with the destination (and their location, when granted).

import { useCallback, useMemo, useState } from "react";
import { useActiveTrip } from "@/lib/trip-store";
import { readPosition, type GroupRow } from "./kit";

/** An active trip counts as "this group's trip" within ~500m of the meetup. */
const MATCH_RADIUS_M = 500;

export function PlanRouteCard({ group, joined }: { group: GroupRow; joined: boolean }) {
  const [busy, setBusy] = useState(false);
  const active = useActiveTrip();

  const activeMatches = useMemo(() => {
    if (!active) return false;
    const dLat = active.to.lat - group.destination_lat;
    const dLng = active.to.lng - group.destination_lng;
    const approxMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111_000;
    return approxMeters < MATCH_RADIUS_M;
  }, [active, group.destination_lat, group.destination_lng]);

  const goPlan = useCallback(async () => {
    setBusy(true);
    try {
      const fix = await readPosition({
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 6_000,
      });
      const params = new URLSearchParams();
      params.set("toLat", String(group.destination_lat));
      params.set("toLng", String(group.destination_lng));
      params.set("toLabel", group.destination_label);
      if (fix) {
        params.set("fromLat", String(fix.lat));
        params.set("fromLng", String(fix.lng));
        params.set("fromLabel", "My location");
      }
      window.location.assign(`/trips?${params.toString()}`);
    } finally {
      setBusy(false);
    }
  }, [group.destination_label, group.destination_lat, group.destination_lng]);

  if (active && activeMatches) {
    const busLeg = active.option.legs.find((l) => l.kind === "bus");
    const routeShort = busLeg && busLeg.kind === "bus" ? busLeg.routeShort : null;
    const arrivalUnix =
      active.itinerary?.arrivalUnix ??
      (active.option.legs[active.option.legs.length - 1] as { arrivalUnix?: number } | undefined)
        ?.arrivalUnix;
    const minsAway = arrivalUnix
      ? Math.max(0, Math.round((arrivalUnix * 1000 - Date.now()) / 60_000))
      : null;
    return (
      <section className="rounded-3xl bg-limestone-soft p-5 ring-1 ring-line">
        <p className="text-[13px] font-medium text-aegean-deep">Trip in progress</p>
        <h2 className="mt-1 text-balance font-display text-[20px] font-semibold leading-tight text-ink">
          {routeShort
            ? `You're on the ${routeShort} to ${group.destination_label}`
            : `You're on your way to ${group.destination_label}`}
        </h2>
        <p className="mt-2 font-sans text-[13px] font-medium text-ink-soft">
          {minsAway != null
            ? `Arriving in about ${minsAway} min. Open the live trip for turn-by-turn guidance. The group already sees your ETA.`
            : "Open the live trip for turn-by-turn guidance. The group already sees your ETA."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/trip/${active.option.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-aegean-deep px-5 py-3 font-sans text-[15px] font-semibold text-limestone transition-opacity hover:opacity-90"
          >
            Resume trip
          </a>
          <button
            type="button"
            onClick={goPlan}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink/5 px-4 py-3 font-sans text-[15px] font-semibold text-ink transition-colors hover:bg-ink/10 disabled:opacity-60"
          >
            {busy ? "Locating…" : "Plan a different route"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-limestone-soft p-5 ring-1 ring-line">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-aegean-deep">
          {joined ? "Now get there" : "Plan your route"}
        </p>
        <h2 className="mt-1 text-balance font-display text-[20px] font-semibold leading-tight text-ink">
          {joined
            ? "Plan the bus that gets you to the meetup"
            : `Find the bus to ${group.destination_label}`}
        </h2>
        <p className="mt-2 font-sans text-[13px] font-medium text-ink-soft">
          {joined
            ? "The group can see your live ETA already. Open the planner to see which bus to catch, when it leaves, and turn-by-turn guidance."
            : "Get door-to-door directions with live bus times, then join the group so everyone sees you converging."}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={goPlan}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-aegean-deep px-5 py-3 font-sans text-[15px] font-semibold text-limestone transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Locating…" : "Plan my route"}
        </button>
        <a
          href={`/trips?toLat=${group.destination_lat}&toLng=${group.destination_lng}&toLabel=${encodeURIComponent(group.destination_label)}`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink/5 px-4 py-3 font-sans text-[15px] font-semibold text-ink transition-colors hover:bg-ink/10"
        >
          Type start point
        </a>
      </div>
      <p className="mt-3 text-[13px] font-medium text-ink-soft">
        Uses live Cyprus bus schedules · you can come back to this page anytime
      </p>
    </section>
  );
}
