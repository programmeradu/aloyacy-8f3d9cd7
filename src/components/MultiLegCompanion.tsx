// Multi-leg trip companion. Renders the full N-leg journey with leg-aware
// status card, dual-vehicle map indicator (current + connecting bus), and
// per-leg action buttons. Used in place of the single-leg `TripCompanion`
// when `active.itinerary` has ≥ 2 ride legs.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { RouteChip } from "@/components/RouteChip";
import { StaleFeedBanner } from "@/components/StaleFeedBanner";
import { IconArrowLeft, IconArrowUpRight, IconBus, IconClock, IconPin } from "@/components/Icons";
import { routeTone } from "@/lib/gtfs";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import {
  multiLegConfirmOnBoard,
  multiLegMarkAlighted,
  multiLegMarkArrived,
  useMultiLegJourney,
  type MultiLegLive,
} from "@/lib/useMultiLegJourney";

import { startLiveTracking } from "@/lib/useJourney";
import { useResumeRefresh, useInvalidateRealtime } from "@/lib/useRealtime";
import { requestCompassPermission } from "@/lib/useCompass";
import type { Itinerary, Leg, RideLeg, WalkLeg, WaitLeg } from "@/lib/itinerary-types";
import { WalkGuidance } from "@/components/WalkGuidance";
import companionHero from "@/assets/companion-hero.jpg";

function fmtMin(s: number) {
  return `${Math.max(0, Math.round(s / 60))} min`;
}
function fmtTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function MultiLegCompanion({ active }: { active: ActiveTrip }) {
  const navigate = useNavigate();
  const itin = active.itinerary!;
  const live = useMultiLegJourney(active);
  const tripId = active.option.id;

  // Force a fresh realtime fetch when rider returns to the tab after >30s away.
  const invalidateRt = useInvalidateRealtime();
  useResumeRefresh(invalidateRt, 30);

  // Map center / span — fit to whole itinerary footprint.
  const bounds = useMemo(() => boundsFor(itin), [itin]);

  // Dual-vehicle map: show both the current and (when connecting) the next
  // leg's vehicles. We pass tripIds via `restrictTripIds` so MapPreview
  // renders both — it already supports that without focusing.
  const restrictTripIds = useMemo(() => {
    const ids: string[] = [];
    if (live.currentRideLeg) ids.push(live.currentRideLeg.tripId);
    if (
      live.nextRideLeg &&
      (live.phase === "walking-to-transfer" ||
        live.phase === "waiting-for-connection")
    ) {
      ids.push(live.nextRideLeg.tripId);
    }
    return ids.length > 0 ? ids : undefined;
  }, [live.currentRideLeg, live.nextRideLeg, live.phase]);

  const mapMarkers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    out.push({ lat: active.from.lat, lng: active.from.lng, kind: "origin", label: active.from.label });
    out.push({ lat: active.to.lat, lng: active.to.lng, kind: "destination", label: active.to.label });
    // Drop a pin at every board + alight stop so the rider sees the chain.
    for (const leg of itin.legs) {
      if (leg.kind === "ride") {
        out.push({ lat: leg.board.lat, lng: leg.board.lng, kind: "stop", label: leg.board.name, tone: "aegean" });
        out.push({ lat: leg.alight.lat, lng: leg.alight.lng, kind: "stop", label: leg.alight.name, tone: "ochre" });
      }
    }
    return out;
  }, [itin, active.from, active.to]);

  return (
    <AppShell>
      {/* Top bar */}
      <div className="px-6 pt-2 pb-4 flex items-center justify-between animate-rise">
        <Link
          to="/trips"
          className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {itin.transfers === 1 ? "One change" : `${itin.transfers} changes`} · ride {Math.max(1, live.rideOrdinal)} of {live.totalRides}
        </span>
        <button
          onClick={() => {
            clearActiveTrip();
            void navigate({ to: "/trips" });
          }}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft hover:text-ink"
        >
          End
        </button>
      </div>

      {/* Hero status card */}
      <section className="px-6 animate-rise" style={{ animationDelay: "60ms" }}>
        <article className="relative overflow-hidden rounded-[32px] bg-card ring-1 ring-line">
          <img
            src={companionHero}
            alt=""
            aria-hidden
            loading="lazy"
            width={1280}
            height={896}
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.18] mix-blend-multiply"
          />
          <div className="relative p-6">
            <PhaseLabel live={live} itin={itin} />
            <PhaseHeadline live={live} itin={itin} />
            <PhaseSub live={live} itin={itin} destLabel={active.to.label} />
          </div>
        </article>
      </section>

      {/* Resilience banners */}
      {live.active && live.vehicleLost && (
        <div className="mt-3"><StaleFeedBanner variant="vehicle-lost" /></div>
      )}
      {live.active && !live.vehicleLost && live.feedStale && (
        <div className="mt-3"><StaleFeedBanner variant="feed-stale" /></div>
      )}
      {live.active &&
        (live.phase === "walking-to-transfer" || live.phase === "waiting-for-connection") &&
        live.nextRideLeg &&
        !live.nextVehicleTracked && (
          <div className="mt-3"><StaleFeedBanner variant="next-not-tracked" /></div>
        )}

      {/* Live map with current (+ next) vehicle */}
      <section className="mt-5 px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <MapPreview
          height="h-56"
          center={bounds.center}
          spanKm={bounds.spanKm}
          markers={mapMarkers}
          liveVehicles
          restrictTripIds={restrictTripIds}
          vehicleOverrides={
            live.fusedCurrentVehicle
              ? { [live.fusedCurrentVehicle.tripId]: live.fusedCurrentVehicle }
              : undefined
          }
          userLocation={
            live.fix
              ? { lat: live.fix.lat, lng: live.fix.lng, accuracyM: live.fix.accuracyM, headingDeg: live.fix.headingDeg }
              : null
          }
        />
      </section>

      {/* Action HUD */}
      <div className="mt-6">
        <MultiLegActions live={live} active={active} />
      </div>

      {/* Turn-by-turn for any walk leg — initial, transfer, or final. */}
      {live.currentLeg?.kind === "walk" && (
        <WalkGuidance
          from={{ lat: live.currentLeg.from.lat, lng: live.currentLeg.from.lng }}
          to={{ lat: live.currentLeg.to.lat, lng: live.currentLeg.to.lng }}
          title={
            live.phase === "walking-to-board"
              ? "Walk to the first stop"
              : live.phase === "walking-to-transfer"
                ? `Walk to bus ${live.nextRideLeg?.routeShort ?? ""}`
                : live.phase === "walking-to-destination"
                  ? "Walk to your destination"
                  : "Walk"
          }
        />
      )}

      {/* Timeline of every leg with current highlighted */}
      <section className="mt-7 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
        <div className="flex items-end justify-between mb-3">
          <h2 className="font-display text-2xl text-ink">Your journey</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
            {Math.round(itin.totalDurationSec / 60)} min · arr {fmtTime(itin.arrivalUnix)}
          </span>
        </div>

        <ol className="relative rounded-[28px] bg-card ring-1 ring-line p-5 space-y-4">
          {itin.legs.map((leg, i) => (
            <LegTimelineRow
              key={i}
              leg={leg}
              isActive={i === live.currentLegIndex}
              isDone={i < live.currentLegIndex || live.phase === "arrived"}
            />
          ))}
        </ol>

        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          Trip {tripId.slice(0, 12)}
        </p>
      </section>
    </AppShell>
  );
}

// ---- Hero copy components ------------------------------------------------

function PhaseLabel({ live, itin }: { live: MultiLegLive; itin: Itinerary }) {
  const tone =
    live.phase === "arrived"
      ? "text-olive"
      : live.phase === "alight-soon"
        ? "text-ochre"
        : live.nextBoardLate
          ? "text-ochre"
          : "text-aegean-deep";
  const text =
    live.phase === "idle"
      ? "Ready to go"
      : live.phase === "walking-to-board"
        ? "Walk to first stop"
        : live.phase === "waiting-to-board"
          ? `Wait for bus ${live.currentRideLeg?.routeShort ?? ""}`
          : live.phase === "riding"
            ? `On bus ${live.currentRideLeg?.routeShort ?? ""} · ride ${live.rideOrdinal} of ${live.totalRides}`
            : live.phase === "alight-soon"
              ? "Alight next"
              : live.phase === "walking-to-transfer"
                ? `Walk to bus ${live.nextRideLeg?.routeShort ?? ""}`
                : live.phase === "waiting-for-connection"
                  ? `Wait for bus ${live.nextRideLeg?.routeShort ?? ""}`
                  : live.phase === "walking-to-destination"
                    ? "Final walk"
                    : "Arrived";
  const detail =
    live.phase === "waiting-for-connection" && live.nextRideLeg
      ? live.nextBoardLate
        ? "running late"
        : live.nextBoardSource === "live"
          ? "live tracking"
          : "scheduled"
      : itin.source === "live"
        ? "live"
        : itin.source === "mixed"
          ? "live + schedule"
          : "scheduled";
  return (
    <p className={`font-mono text-[10px] uppercase tracking-[0.24em] ${tone}`}>
      {text} <span className="text-ink-soft">— {detail}</span>
    </p>
  );
}

function PhaseHeadline({ live, itin }: { live: MultiLegLive; itin: Itinerary }) {
  const base = "mt-2 font-display text-[36px] leading-[1.05] text-ink text-balance";
  if (live.phase === "walking-to-board" && live.currentRideLeg) {
    return (
      <h1 className={base}>
        Walk to <span className="text-aegean-deep">{live.currentRideLeg.board.name}</span>
        <br />
        <span className="italic text-olive-soft">bus {live.currentRideLeg.routeShort} in {fmtMin(live.secsToCurrentBoard)}.</span>
      </h1>
    );
  }
  if (live.phase === "waiting-to-board" && live.currentRideLeg) {
    return (
      <h1 className={base}>
        Bus {live.currentRideLeg.routeShort} in{" "}
        <span className="text-aegean-deep">{Math.max(0, Math.round(live.secsToCurrentBoard / 60))}</span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">min</span>
        <br />
        <span className="italic text-olive-soft">at {live.currentRideLeg.board.name}.</span>
      </h1>
    );
  }
  if (live.phase === "riding" && live.currentRideLeg) {
    const afterPart = live.nextRideLeg
      ? ` then change for bus ${live.nextRideLeg.routeShort}`
      : "";
    return (
      <h1 className={base}>
        Off in <span className="text-aegean-deep">{Math.max(0, Math.round(live.secsToCurrentAlight / 60))}</span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">min</span>
        <br />
        <span className="italic text-olive-soft">
          at {live.currentRideLeg.alight.name}{afterPart}.
        </span>
      </h1>
    );
  }
  if (live.phase === "alight-soon" && live.currentRideLeg) {
    return (
      <h1 className={base}>
        Step off <span className="text-ochre">next</span>
        <br />
        <span className="italic text-olive-soft">{live.currentRideLeg.alight.name}.</span>
      </h1>
    );
  }
  if (live.phase === "walking-to-transfer" && live.nextRideLeg && live.currentLeg?.kind === "walk") {
    return (
      <h1 className={base}>
        Walk to <span className="text-aegean-deep">{live.nextRideLeg.board.name}</span>
        <br />
        <span className="italic text-olive-soft">
          for bus {live.nextRideLeg.routeShort} — {fmtMin(live.currentLeg.durationSec)}.
        </span>
      </h1>
    );
  }
  if (live.phase === "waiting-for-connection" && live.nextRideLeg) {
    return (
      <h1 className={base}>
        Bus {live.nextRideLeg.routeShort} in{" "}
        <span className={live.nextBoardLate ? "text-ochre" : "text-aegean-deep"}>
          {Math.max(0, Math.round(live.secsToNextBoard / 60))}
        </span>
        <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">min</span>
        <br />
        <span className="italic text-olive-soft">at {live.nextRideLeg.board.name}.</span>
      </h1>
    );
  }
  if (live.phase === "walking-to-destination") {
    return (
      <h1 className={base}>
        Final stretch
        <br />
        <span className="italic text-olive-soft">{Math.max(0, Math.round((live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0) / 60))} min on foot.</span>
      </h1>
    );
  }
  if (live.phase === "arrived") {
    return (
      <h1 className={base}>
        You're <span className="text-olive">there</span>
        <br />
        <span className="italic text-olive-soft">welcome.</span>
      </h1>
    );
  }
  // idle — pre-start preview
  const firstRide = itin.legs.find((l): l is RideLeg => l.kind === "ride");
  return (
    <h1 className={base}>
      Door to door in <span className="text-aegean-deep">{Math.round(itin.totalDurationSec / 60)}</span>
      <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-soft">min</span>
      <br />
      <span className="italic text-olive-soft">
        starting on bus {firstRide?.routeShort ?? ""}.
      </span>
    </h1>
  );
}

function PhaseSub({
  live,
  itin,
  destLabel,
}: {
  live: MultiLegLive;
  itin: Itinerary;
  destLabel: string;
}) {
  const text =
    live.phase === "idle"
      ? `${itin.transfers === 1 ? "One change" : `${itin.transfers} changes`} along the way. We'll guide you through every step.`
      : live.phase === "walking-to-board"
        ? "We'll watch the bus while you walk."
        : live.phase === "waiting-to-board"
          ? "Stay near the curb. Tap when you're aboard."
          : live.phase === "riding"
            ? live.nextRideLeg
              ? `After this, you'll change for bus ${live.nextRideLeg.routeShort} at ${live.currentRideLeg?.alight.name}.`
              : "Sit back. We'll buzz when it's time to alight."
            : live.phase === "alight-soon"
              ? live.nextRideLeg
                ? `Press the cord — then walk to ${live.nextRideLeg.board.name} for bus ${live.nextRideLeg.routeShort}.`
                : `Press the cord — final walk to ${destLabel} after.`
              : live.phase === "walking-to-transfer"
                ? `${live.nextRideLeg ? `Bus ${live.nextRideLeg.routeShort} in ${fmtMin(live.secsToNextBoard)}.` : ""} Keep moving.`
                : live.phase === "waiting-for-connection"
                  ? live.nextBoardLate
                    ? `Heads up — running ${Math.round((live.secsToNextBoard - (live.nextRideLeg?.board.departureUnix ?? 0) + Math.floor(Date.now()/1000)) / 60)} min late vs schedule.`
                    : "We'll alert you the moment the doors open."
                  : live.phase === "walking-to-destination"
                    ? `${Math.max(0, Math.round((live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0) / 60))} min on foot to ${destLabel}.`
                    : `Welcome to ${destLabel}.`;
  return (
    <p className="mt-4 flex items-start gap-2 text-[13px] text-ink-soft leading-relaxed">
      <IconClock className="mt-0.5 size-3.5 shrink-0 text-ink-soft" />
      <span>{text}</span>
    </p>
  );
}

// ---- Action HUD ----------------------------------------------------------

function MultiLegActions({ live, active }: { live: MultiLegLive; active: ActiveTrip }) {
  const navigate = useNavigate();
  if (!live.active) {
    return (
      <section className="px-6 animate-rise" style={{ animationDelay: "100ms" }}>
        <div className="rounded-[28px] bg-aegean-soft/40 ring-1 ring-aegean/20 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
            Live guidance
          </p>
          <p className="mt-2 font-display text-[26px] leading-tight text-ink">
            Start the journey to {active.to.label}.
          </p>
          <p className="mt-2 text-[13px] text-ink-soft">
            We will walk you to the first stop, alert you when each bus is
            approaching, prompt you off at the right moment, and guide every
            transfer.
          </p>
          <button
            onClick={async () => {
              await requestCompassPermission();
              startLiveTracking();
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            Start journey
            <IconArrowUpRight className="size-3.5" />
          </button>
        </div>
      </section>
    );
  }

  if (live.phase === "waiting-to-board") {
    return (
      <section className="px-6 animate-rise">
        <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
            On board bus {live.currentRideLeg?.routeShort}?
          </p>
          <p className="mt-2 text-[13px] text-ink-soft">
            Tap when you're seated — we'll switch to ride mode and watch for{" "}
            {live.currentRideLeg?.alight.name}.
          </p>
          <button
            onClick={() => multiLegConfirmOnBoard()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            I'm on board
            <IconBus className="size-3.5" />
          </button>
        </div>
      </section>
    );
  }

  if (live.phase === "alight-soon") {
    return (
      <section className="px-6 animate-rise">
        <div className="rounded-[28px] bg-ochre-soft ring-1 ring-ochre/40 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
            Press the stop button now
          </p>
          <p className="mt-2 font-display text-[26px] leading-tight text-ink">
            {live.currentRideLeg?.alight.name}
          </p>
          <button
            onClick={() => multiLegMarkAlighted()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            I'm off
            <IconPin className="size-3.5" />
          </button>
        </div>
      </section>
    );
  }

  if (live.phase === "walking-to-destination") {
    const walkMin = Math.max(
      0,
      Math.round((live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0) / 60),
    );
    return (
      <section className="px-6 animate-rise">
        <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive">
            Final stretch — {walkMin} min on foot
          </p>
          <p className="mt-2 font-display text-[22px] leading-tight text-ink">
            Walking to {active.to.label}.
          </p>
          <p className="mt-2 text-[13px] text-ink-soft">
            We'll close the trip automatically when you arrive — or tap below
            the moment you're at the door.
          </p>
          <button
            onClick={() => multiLegMarkArrived()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            I'm here
            <IconPin className="size-3.5" />
          </button>
        </div>
      </section>
    );
  }

  if (live.phase === "arrived") {

    return (
      <section className="px-6 animate-rise">
        <div className="rounded-[28px] bg-olive-soft ring-1 ring-olive/30 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive">
            You've arrived
          </p>
          <p className="mt-2 font-display text-[26px] leading-tight text-ink">
            Welcome to {active.to.label}.
          </p>
          <button
            onClick={() => {
              clearActiveTrip();
              void navigate({ to: "/" });
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            Done
          </button>
        </div>
      </section>
    );
  }

  // Other phases: just show a calm "we've got you" pill.
  return (
    <section className="px-6 animate-rise">
      <div className="flex items-center gap-3 rounded-full bg-card ring-1 ring-line px-5 py-3 text-[12px] text-ink-soft">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-aegean-deep/50 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-aegean-deep" />
        </span>
        <span>Tracking live — we'll buzz when you need to act.</span>
      </div>
    </section>
  );
}

// ---- Timeline row --------------------------------------------------------

function LegTimelineRow({
  leg,
  isActive,
  isDone,
}: {
  leg: Leg;
  isActive: boolean;
  isDone: boolean;
}) {
  const ring = isDone
    ? "bg-olive/10 text-olive ring-olive/20"
    : isActive
      ? "bg-aegean-deep text-white ring-aegean-deep"
      : "bg-limestone-soft text-ink-soft ring-line";

  let glyph: React.ReactNode = null;
  let title: React.ReactNode = null;
  let sub: React.ReactNode = null;
  let accent: React.ReactNode = null;

  if (leg.kind === "ride") {
    glyph = <IconBus className="size-3.5" />;
    title = (
      <>
        Board <span className="text-aegean-deep">BUS {leg.routeShort}</span> — {leg.routeLong}
      </>
    );
    sub = `${leg.board.name} → ${leg.alight.name} · ${fmtTime(leg.board.departureUnix)} — ${fmtTime(leg.alight.arrivalUnix)} · ${leg.stopCount} stops`;
    accent = <RouteChip code={leg.routeShort} tone={routeTone(leg.routeId)} size="sm" />;
  } else if (leg.kind === "walk") {
    glyph = <IconPin className="size-3.5" />;
    title = (
      <>
        Walk to <span className="text-ink">{(leg as WalkLeg).to.name}</span>
      </>
    );
    sub = `${fmtMin((leg as WalkLeg).durationSec)} · ${(leg as WalkLeg).distanceMeters} m`;
  } else {
    glyph = <IconClock className="size-3.5" />;
    title = <>Wait at {(leg as WaitLeg).name}</>;
    sub = `${fmtMin((leg as WaitLeg).durationSec)} at the stop`;
  }

  return (
    <li className="flex items-start gap-4">
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1 transition-colors ${ring}`}>
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-display text-lg leading-tight ${isActive ? "text-ink" : "text-ink-soft"}`}>
          {title}
        </p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {sub}
        </p>
      </div>
      {accent}
    </li>
  );
}

// ---- Geometry helpers ----------------------------------------------------

function boundsFor(it: Itinerary) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const leg of it.legs) {
    const pts: Array<{ lat: number; lng: number }> =
      leg.kind === "ride"
        ? [
            { lat: leg.board.lat, lng: leg.board.lng },
            { lat: leg.alight.lat, lng: leg.alight.lng },
          ]
        : leg.kind === "walk"
          ? [
              { lat: leg.from.lat, lng: leg.from.lng },
              { lat: leg.to.lat, lng: leg.to.lng },
            ]
          : [{ lat: leg.lat, lng: leg.lng }];
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
  }
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  // Rough span — 1 deg lat ≈ 111 km.
  const spanKm = Math.max(
    1.5,
    Math.max((maxLat - minLat) * 111, (maxLng - minLng) * 95) * 1.3,
  );
  return { center, spanKm };
}
