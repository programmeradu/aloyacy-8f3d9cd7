// Arrival promise UI — "get me to Larnaca by 16:00, and keep watching".
//
// Two surfaces live here because they share one query cache:
//   • ArrivalPromiseCommit — the CTA shown once the rider has set an
//     arrive-by time and we have a plannable trip.
//   • ArrivalPromiseWatchList — the standing promises, with the live
//     departure ladder, the reason behind the current buffer, and cancel.
//
// Copy and clock formatting come from @aloya/core/arrival-promise so the
// card, the push body and the native app never disagree.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  bufferNote,
  countdownLabel,
  formatClock,
  formatDayLabel,
  promiseHeadline,
  rungLine,
  type LadderRung,
  type MarginPref,
} from "@aloya/core/arrival-promise";
import {
  cancelArrivalPromise,
  createArrivalPromise,
  refreshArrivalPromise,
  type ArrivalPromiseRow,
} from "@/lib/arrival-promise.functions";
import { useAuth } from "@/lib/useAuth";
import { AuthSheet } from "@/components/AuthSheet";
import arrivalHero from "@/assets/arrival-promise-hero.jpg";
import { ArrivalShiftPanel } from "./ArrivalShiftPanel";
import { bootstrapAnonymousAuth } from "@/lib/anon-auth";
import {
  ARRIVAL_PROMISE_QUERY_KEY as QUERY_KEY,
  ensurePushDevice,
  useArrivalPromises,
  useNowUnix,
  type PromisePoint as Point,
} from "./arrivalPromiseShared";

export function ArrivalPromiseCommit({
  origin,
  destination,
  targetArrivalUnix,
}: {
  origin: Point;
  destination: Point;
  targetArrivalUnix: number;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const create = useServerFn(createArrivalPromise);
  const [authOpen, setAuthOpen] = useState(false);
  const [margin, setMargin] = useState<MarginPref>("normal");
  const [error, setError] = useState<string | null>(null);
  const nowUnix = useNowUnix(30_000);

  const existing = useArrivalPromises(!!user).data;
  const alreadyWatching = (existing ?? []).some(
    (p) =>
      Math.abs(p.target_arrival_unix - targetArrivalUnix) < 15 * 60 &&
      p.destination_label === destination.label &&
      (p.status === "watching" || p.status === "leave-now"),
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const deviceId = await ensurePushDevice();
      return create({
        data: { origin, destination, targetArrivalUnix, margin, deviceId },
      });
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Could not start watching"),
  });

  if (targetArrivalUnix <= nowUnix + 300 || alreadyWatching) return null;

  const when = `${formatClock(targetArrivalUnix)} ${formatDayLabel(targetArrivalUnix, nowUnix)}`;

  return (
    <>
      <section className="overflow-hidden rounded-3xl bg-card ring-1 ring-line">
        <img
          src={arrivalHero}
          alt="Coastal road curving toward a steady clock face — Aloya holding an arrival time"
          width={1536}
          height={832}
          loading="lazy"
          className="h-32 w-full object-cover object-right sm:h-40"
        />
        <div className="p-5 sm:p-6">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
            Arrival promise
          </p>
          <h2 className="mt-2 font-display text-[20px] leading-tight font-bold text-ink">
            Make sure I reach {destination.label} by {when}
          </h2>
          <p className="mt-2 max-w-prose font-sans text-[13.5px] leading-relaxed text-ink-soft">
            Aloya keeps re-planning this trip as the timetable, the weather and the roads change,
            then tells you when to leave — an hour before, thirty minutes before, and at the moment
            you need to walk out the door.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(["relaxed", "normal", "tight"] as MarginPref[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMargin(m)}
                aria-pressed={margin === m}
                className={`h-9 rounded-full px-4 font-sans text-[12.5px] font-semibold transition-colors ${
                  margin === m
                    ? "bg-ink text-limestone"
                    : "bg-limestone-soft text-ink-soft ring-1 ring-line hover:text-ink"
                }`}
              >
                {m === "relaxed" ? "15 min spare" : m === "normal" ? "8 min spare" : "Cut it fine"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              // Anonymous-first: a guest session is enough. If the bootstrap
              // hasn't finished yet, finish it rather than asking for an email.
              if (!user) {
                void bootstrapAnonymousAuth().then(() => mutation.mutate());
                return;
              }
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="mt-5 inline-flex h-11 items-center gap-2.5 rounded-full bg-aegean px-6 font-sans text-[13.5px] font-bold text-limestone transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <WatchGlyph className="size-4" />
            {mutation.isPending ? "Setting the watch…" : "Watch this arrival"}
          </button>

          {error ? (
            <p className="mt-3 font-sans text-[12.5px] font-medium text-ochre">{error}</p>
          ) : null}
        </div>
      </section>

      <AuthSheet
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Sign in to hold your arrival"
        subtitle="Aloya watches the trip on the server, so the reminder reaches you even with the app closed."
      />
    </>
  );
}

export function ArrivalPromiseWatchList() {
  const { user } = useAuth();
  const { data, isLoading } = useArrivalPromises(!!user);
  const promises = (data ?? []).filter((p) => p.status !== "cancelled" && p.status !== "done");

  if (!user || isLoading || promises.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
        {promises.length === 1 ? "Arrival you asked us to hold" : "Arrivals you asked us to hold"}
      </p>
      {promises.map((p) => (
        <PromiseRow key={p.id} promise={p} />
      ))}
    </section>
  );
}

function PromiseRow({ promise }: { promise: ArrivalPromiseRow }) {
  const nowUnix = useNowUnix(15_000);
  const qc = useQueryClient();
  const cancel = useServerFn(cancelArrivalPromise);
  const refresh = useServerFn(refreshArrivalPromise);
  const [expanded, setExpanded] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: () => cancel({ data: { id: promise.id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
  const refreshMutation = useMutation({
    mutationFn: () => refresh({ data: { id: promise.id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  // A one-shot refresh when the card first appears keeps a promise created on
  // another device from showing a stale leave time.
  useEffect(() => {
    const lastMs = promise.last_replan_at ? new Date(promise.last_replan_at).getTime() : 0;
    if (Date.now() - lastMs > 10 * 60_000) refreshMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promise.id]);

  const ladder = useMemo(
    () => (Array.isArray(promise.ladder_json) ? promise.ladder_json : ([] as LadderRung[])),
    [promise.ladder_json],
  );
  const note = bufferNote({
    bufferSec: promise.buffer_sec,
    reasonShort: promise.reason_short,
    scheduledLeaveUnix:
      ladder.find((r) => r.recommended)?.leaveByUnix ?? promise.plan_json?.departureUnix ?? null,
  });
  const routes = (promise.plan_json?.legs ?? [])
    .map((l) => (l.kind === "ride" ? l.routeShort : null))
    .filter((r): r is string => Boolean(r));

  const missed = promise.status === "missed";
  const leaveNow = promise.status === "leave-now" || promise.leave_by_unix - nowUnix <= 0;

  return (
    <article
      className={`rounded-3xl p-5 ring-1 transition-colors ${
        missed
          ? "bg-ochre/10 ring-ochre/40"
          : leaveNow
            ? "bg-aegean/10 ring-aegean/40"
            : "bg-card ring-line"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[17px] leading-snug font-bold text-ink">
            {promiseHeadline({
              destinationLabel: promise.destination_label,
              targetArrivalUnix: promise.target_arrival_unix,
              nowUnix,
            })}
          </h3>
          <p className="mt-1 font-sans text-[13px] font-medium text-ink-soft">
            from {promise.origin_label}
            {routes.length > 0 ? ` · BUS ${routes.join(" → ")}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] ${
            missed
              ? "bg-ochre text-limestone"
              : leaveNow
                ? "bg-aegean text-limestone"
                : "bg-limestone-soft text-ink-soft"
          }`}
        >
          {missed ? "Out of reach" : leaveNow ? "Leave now" : "Watching"}
        </span>
      </div>

      {missed ? (
        <>
          <p className="mt-3 font-sans text-[13.5px] leading-relaxed text-ink">
            No service currently reaches {promise.destination_label} by{" "}
            {formatClock(promise.target_arrival_unix)}. We are still checking every few minutes in
            case a later plan opens up.
          </p>
          <ArrivalShiftPanel
            promiseId={promise.id}
            ladder={ladder}
            targetArrivalUnix={promise.target_arrival_unix}
            margin={promise.margin_pref}
            bufferSec={promise.buffer_sec}
            destinationLabel={promise.destination_label}
            nowUnix={nowUnix}
          />
        </>
      ) : (
        <p className="mt-3 font-display text-[22px] leading-none font-bold text-ink">
          Leave {formatClock(promise.leave_by_unix)}
          <span className="ml-2 align-middle font-sans text-[13px] font-semibold text-ink-soft">
            {countdownLabel(promise.leave_by_unix, nowUnix)}
          </span>
        </p>
      )}

      {note ? (
        <p className="mt-2 font-sans text-[12.5px] font-medium text-ink-soft">{note}</p>
      ) : null}

      {ladder.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-aegean"
          >
            {expanded ? "Hide departure options" : `Show ${ladder.length} departure options`}
          </button>
          {expanded ? (
            <ul className="mt-3 space-y-2 border-t border-line pt-3">
              {ladder.map((rung) => (
                <li
                  key={rung.itineraryId}
                  className={`font-sans text-[13px] leading-relaxed ${
                    rung.verdict === "late"
                      ? "text-ink-soft line-through decoration-ochre/60"
                      : "text-ink"
                  }`}
                >
                  {rungLine(rung)}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="h-9 rounded-full bg-limestone-soft px-4 font-sans text-[12.5px] font-semibold text-ink ring-1 ring-line transition-colors hover:bg-card disabled:opacity-60"
        >
          {refreshMutation.isPending ? "Re-checking…" : "Re-check now"}
        </button>
        <button
          type="button"
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
          className="h-9 rounded-full px-4 font-sans text-[12.5px] font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-60"
        >
          Stop watching
        </button>
      </div>
    </article>
  );
}

/** Concentric watch mark — a target held steady, not an icon-set glyph. */
function WatchGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
