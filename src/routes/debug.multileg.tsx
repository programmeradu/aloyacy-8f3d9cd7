import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { planMultiLeg } from "@/lib/multileg.functions";
import type { Itinerary, RideLeg } from "@/lib/itinerary-types";

export const Route = createFileRoute("/debug/multileg")({
  head: () => ({
    meta: [
      { title: "Multi-leg planner — Phase 2c checkpoint" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DebugMultiLeg,
});

// A few real Cyprus pairs covering different planner stress modes.
const PRESETS = [
  {
    label: "Larnaca centre → Limassol Old Port",
    from: { lat: 34.9182, lng: 33.6233, label: "Larnaca centre" },
    to: { lat: 34.6712, lng: 33.0413, label: "Limassol Old Port" },
  },
  {
    label: "Nicosia Eleftheria → Paphos Harbour",
    from: { lat: 35.1689, lng: 33.3624, label: "Eleftheria Sq" },
    to: { lat: 34.7541, lng: 32.4068, label: "Paphos Harbour" },
  },
  {
    label: "Strovolos → Larnaca Airport",
    from: { lat: 35.1452, lng: 33.3261, label: "Strovolos" },
    to: { lat: 34.8751, lng: 33.6249, label: "Larnaca Airport" },
  },
  {
    label: "Aglandjia → University of Cyprus",
    from: { lat: 35.1545, lng: 33.4001, label: "Aglandjia" },
    to: { lat: 35.1396, lng: 33.4119, label: "UCY" },
  },
];

function fmtMin(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function DebugMultiLeg() {
  const fn = useServerFn(planMultiLeg);
  const [presetIdx, setPresetIdx] = useState(0);
  const preset = PRESETS[presetIdx];

  const m = useMutation({
    mutationFn: () => fn({ data: { from: preset.from, to: preset.to, debug: true } }),
  });

  return (
    <main className="min-h-dvh bg-limestone text-ink">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
            Phase 2c checkpoint
          </p>
          <h1 className="mt-1.5 font-display text-[36px] leading-[1.04] text-ink text-balance">
            Schedule + realtime,
            <br />
            <span className="italic text-aegean-deep">honestly merged.</span>
          </h1>
          <p className="mt-3 max-w-[58ch] text-[13px] text-ink-soft leading-relaxed">
            Bounded RAPTOR runs over the full Cyprus timetable and the live
            GTFS-RT feed in parallel. Results are merged, deduped, and the
            no-mediocrity filter removes transfers that don't meaningfully
            beat the best direct. Each ride leg is tagged with its source.
          </p>
        </header>

        <section className="mt-6 flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPresetIdx(i)}
              className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                i === presetIdx
                  ? "bg-ink text-limestone"
                  : "bg-card ring-1 ring-line text-ink-soft hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </section>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="rounded-full bg-aegean-deep px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-limestone disabled:opacity-50"
          >
            {m.isPending ? "Searching…" : "Run search"}
          </button>
          {m.data ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              {m.data.itineraries.length} results · {m.data.elapsedMs} ms
            </span>
          ) : null}
        </div>

        {m.error ? (
          <p className="mt-6 font-mono text-[11px] text-ochre">
            {(m.error as Error).message}
          </p>
        ) : null}

        {m.data?.diagnostics ? (
          <section className="mt-6 rounded-[20px] bg-card ring-1 ring-line p-5 font-mono text-[11px] text-ink-soft space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-ink mb-2">Merge funnel</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 tabular-nums">
                <dt>raw (live + scheduled)</dt><dd className="text-ink">{m.data.diagnostics.mergedRaw}</dd>
                <dt>after dedup</dt><dd className="text-ink">{m.data.diagnostics.afterDedup}</dd>
                <dt>pruned as mediocre</dt><dd className="text-ink">{m.data.diagnostics.prunedMediocre}</dd>
                <dt>final</dt><dd className="text-ink">{m.data.diagnostics.finalCount}</dd>
              </dl>
            </div>

            {m.data.diagnostics.scheduled ? (
              <div className="pt-3 border-t border-line/60">
                <p className="text-[10px] uppercase tracking-[0.22em] text-ink mb-2">Scheduled (RAPTOR)</p>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 tabular-nums">
                  <dt>date</dt><dd className="text-ink">{m.data.diagnostics.scheduled.date}</dd>
                  <dt>origin stops ≤1.2km</dt><dd className="text-ink">{m.data.diagnostics.scheduled.originStopCount} (nearest {m.data.diagnostics.scheduled.nearestOriginStopKm?.toFixed(2)} km)</dd>
                  <dt>dest stops ≤1.2km</dt><dd className="text-ink">{m.data.diagnostics.scheduled.destStopCount} (nearest {m.data.diagnostics.scheduled.nearestDestStopKm?.toFixed(2)} km)</dd>
                  <dt>schedule stops loaded</dt><dd className="text-ink">{m.data.diagnostics.scheduled.scheduleStopsLoaded}</dd>
                  <dt>trips loaded for date</dt><dd className="text-ink">{m.data.diagnostics.scheduled.scheduleTripsLoaded}</dd>
                  <dt>RAPTOR rounds run</dt><dd className="text-ink">{m.data.diagnostics.scheduled.roundsRun}</dd>
                  <dt>trips scanned</dt><dd className="text-ink">{m.data.diagnostics.scheduled.scannedTrips}</dd>
                  <dt>walk transfers</dt><dd className="text-ink">{m.data.diagnostics.scheduled.walkTransfers}</dd>
                  <dt>candidate itineraries</dt><dd className="text-ink">{m.data.diagnostics.scheduled.candidateItineraries}</dd>
                  <dt>live arrivals (overlay)</dt><dd className="text-ink">{m.data.diagnostics.scheduled.liveArrivalCount}</dd>
                  <dt>legs overlaid live</dt><dd className="text-ink">{m.data.diagnostics.scheduled.legsOverlaid}</dd>
                  <dt>load / raptor / overlay ms</dt><dd className="text-ink">{m.data.diagnostics.scheduled.loadMs} / {m.data.diagnostics.scheduled.raptorMs} / {m.data.diagnostics.scheduled.overlayMs}</dd>
                </dl>
                {m.data.diagnostics.scheduled.reasons.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-ochre mb-1">Why scheduled gave nothing</p>
                    {m.data.diagnostics.scheduled.reasons.map((r: string, i: number) => (
                      <p key={i} className="text-ink leading-relaxed">— {r}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {m.data.diagnostics.live ? (
              <div className="pt-3 border-t border-line/60">
                <p className="text-[10px] uppercase tracking-[0.22em] text-ink mb-2">Live (realtime feed)</p>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 tabular-nums">
                  <dt>live trips in feed</dt><dd className="text-ink">{m.data.diagnostics.live.liveTripCount} ({m.data.diagnostics.live.liveArrivalCount} arrivals)</dd>
                  <dt>direct candidates</dt><dd className="text-ink">{m.data.diagnostics.live.directRawCount}</dd>
                  <dt>transfer candidates</dt><dd className="text-ink">{m.data.diagnostics.live.transferRawCount}</dd>
                  <dt>kept (top-K)</dt><dd className="text-ink">{m.data.diagnostics.live.keptCount}</dd>
                </dl>
                {m.data.diagnostics.live.reasons.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-ochre mb-1">Why live gave nothing</p>
                    {m.data.diagnostics.live.reasons.map((r: string, i: number) => (
                      <p key={i} className="text-ink leading-relaxed">— {r}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {m.data ? (
          <section className="mt-8 space-y-4">
            {m.data.itineraries.length === 0 ? (
              <p className="font-mono text-[11px] text-ink-soft">
                No itineraries found — see funnel above for why.
              </p>
            ) : (
              m.data.itineraries.map((it, idx) => (
                <ItineraryCard key={it.id} it={it} rank={idx + 1} />
              ))
            )}
          </section>
        ) : null}

        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft text-center">
          Phase 2c of 5 — RAPTOR + realtime overlay
        </p>
      </div>
    </main>
  );
}

function ItineraryCard({ it, rank }: { it: Itinerary; rank: number }) {
  const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");

  return (
    <article className="rounded-[24px] bg-card ring-1 ring-line p-5">
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
            {String(rank).padStart(2, "0")}
          </span>
          <span className="font-display text-[28px] text-ink tabular-nums leading-none">
            {fmtMin(it.totalDurationSec)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            arrive {fmtTime(it.arrivalUnix)}
          </span>
        </div>
        <div className="text-right">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-aegean-deep">
            {it.transfers === 0 ? "Direct" : `${it.transfers} change${it.transfers > 1 ? "s" : ""}`}
          </span>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap gap-1.5 items-center">
        {rides.map((r, i) => (
          <span key={i} className="inline-flex items-baseline gap-1">
            {i > 0 ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                change
              </span>
            ) : null}
            <span className="rounded-md bg-ink text-limestone font-mono text-[11px] px-2 py-0.5 tracking-wider">
              {r.routeShort}
            </span>
          </span>
        ))}
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft ml-2">
          walk {Math.round(it.totalWalkMeters)} m
        </span>
      </div>

      <ol className="mt-4 border-l border-line ml-2 pl-4 space-y-3">
        {it.legs.map((leg, i) => (
          <li key={i} className="text-[12px] leading-snug">
            {leg.kind === "ride" ? (
              <div>
                <p className="text-ink">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-aegean-deep mr-2">
                    Bus {leg.routeShort}
                  </span>
                  {leg.board.name} → {leg.alight.name}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mt-0.5">
                  {fmtTime(leg.board.departureUnix)} — {fmtTime(leg.alight.arrivalUnix)} ·{" "}
                  {leg.stopCount} stops
                  {leg.delaySec ? ` · ${leg.delaySec > 0 ? "+" : ""}${Math.round(leg.delaySec / 60)} min` : ""}
                </p>
              </div>
            ) : leg.kind === "walk" ? (
              <p className="text-ink-soft">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] mr-2">
                  Walk {leg.verified ? "" : "≈"}
                  {fmtMin(leg.durationSec)}
                </span>
                {leg.from.name} → {leg.to.name} · {leg.distanceMeters} m
              </p>
            ) : (
              <p className="text-ink-soft">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] mr-2">
                  Wait {fmtMin(leg.durationSec)}
                </span>
                at {leg.name}
              </p>
            )}
          </li>
        ))}
      </ol>

      <footer className="mt-4 pt-3 border-t border-line/60 flex items-baseline justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          score {Math.round(it.score)} · source {it.source}
        </span>
      </footer>
    </article>
  );
}
