import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { planMultiLeg } from "@/lib/multileg.functions";
import type { Itinerary, RideLeg, WalkLeg, WaitLeg } from "@/lib/itinerary-types";

export const Route = createFileRoute("/debug/multileg")({
  head: () => ({
    meta: [
      { title: "Multi-leg planner — Phase 2a checkpoint" },
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
    mutationFn: () => fn({ data: { from: preset.from, to: preset.to } }),
  });

  return (
    <main className="min-h-dvh bg-limestone text-ink">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
            Phase 2a checkpoint
          </p>
          <h1 className="mt-1.5 font-display text-[36px] leading-[1.04] text-ink text-balance">
            One transfer,
            <br />
            <span className="italic text-aegean-deep">honestly proposed.</span>
          </h1>
          <p className="mt-3 max-w-[58ch] text-[13px] text-ink-soft leading-relaxed">
            The search returns direct AND 1-transfer options together, scores
            them on realistic time + transfer friction + reliability, and
            filters out any transfer that doesn't beat the best direct by ≥ 3
            min or ≥ 15%. Walking geometry for the top 3 picks is verified
            against Google before display.
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

        {m.data ? (
          <section className="mt-8 space-y-4">
            {m.data.itineraries.length === 0 ? (
              <p className="font-mono text-[11px] text-ink-soft">
                No itineraries found in the live feed window.
              </p>
            ) : (
              m.data.itineraries.map((it, idx) => (
                <ItineraryCard key={it.id} it={it} rank={idx + 1} />
              ))
            )}
          </section>
        ) : null}

        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft text-center">
          Phase 2a of 5 — 1-transfer search
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
