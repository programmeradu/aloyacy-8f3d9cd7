// "16:00 is out of reach" is only half an answer. This panel gives the rider
// the other half: how much later would actually work, measured from the same
// ladder the watcher planned, and a one-tap way to move the promise there.

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  formatClock,
  formatDayLabel,
  shiftHeadline,
  shiftOptionLine,
  shiftOptionName,
  suggestArrivalShift,
  type LadderRung,
  type MarginPref,
  type ShiftOption,
} from "@aloya/core/arrival-promise";
import { adjustArrivalPromise } from "@/lib/arrival-promise.functions";
import { ARRIVAL_PROMISE_QUERY_KEY as QUERY_KEY } from "./arrivalPromiseShared";

/** Local datetime string an <input type="datetime-local"> understands. */
function toLocalInput(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function ArrivalShiftPanel({
  promiseId,
  ladder,
  targetArrivalUnix,
  margin,
  bufferSec,
  destinationLabel,
  nowUnix,
}: {
  promiseId: string;
  ladder: LadderRung[];
  targetArrivalUnix: number;
  margin: MarginPref;
  bufferSec: number;
  destinationLabel: string;
  nowUnix: number;
}) {
  const qc = useQueryClient();
  const adjust = useServerFn(adjustArrivalPromise);
  const [custom, setCustom] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const suggestion = useMemo(
    () => suggestArrivalShift({ ladder, targetArrivalUnix, margin, bufferSec, nowUnix }),
    [ladder, targetArrivalUnix, margin, bufferSec, nowUnix],
  );

  const [picked, setPicked] = useState<number | null>(null);
  const chosenExtra = picked ?? suggestion?.recommended?.extraSec ?? null;

  const mutation = useMutation({
    mutationFn: (newTargetUnix: number) =>
      adjust({ data: { id: promiseId, targetArrivalUnix: newTargetUnix } }),
    onSuccess: () => {
      setError(null);
      setCustom("");
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not move the arrival time"),
  });

  if (!suggestion) return null;

  const chosen: ShiftOption | null =
    suggestion.options.find((o) => o.extraSec === chosenExtra) ?? suggestion.recommended;

  const customUnix = custom ? Math.floor(new Date(custom).getTime() / 1000) : null;
  const commitUnix =
    customUnix && Number.isFinite(customUnix) ? customUnix : (chosen?.newTargetUnix ?? null);

  return (
    <div className="mt-4 rounded-2xl bg-limestone-soft/70 p-4 ring-1 ring-line">
      <p className="font-sans text-[13px] leading-relaxed font-medium text-ink">
        {shiftHeadline(suggestion, targetArrivalUnix)}
      </p>

      <p className="mt-3 font-mono text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
        Give it room
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {suggestion.options.map((o) => {
          const active = !custom && o.extraSec === chosen?.extraSec;
          return (
            <button
              key={o.extraSec}
              type="button"
              onClick={() => {
                setPicked(o.extraSec);
                setCustom("");
              }}
              aria-pressed={active}
              className={`flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
                active
                  ? "bg-ink text-limestone"
                  : "bg-card text-ink ring-1 ring-line hover:ring-aegean/50"
              }`}
            >
              <span className="font-sans text-[13px] font-semibold">
                {shiftOptionName(o.kind)}
                {o.kind === "suggested" && suggestion.recommended?.extraSec === o.extraSec ? (
                  <span
                    className={`ml-2 font-mono text-[9.5px] tracking-[0.12em] uppercase ${
                      active ? "text-limestone/70" : "text-aegean"
                    }`}
                  >
                    Best fit
                  </span>
                ) : null}
              </span>
              <span
                className={`font-sans text-[12.5px] font-medium ${
                  active ? "text-limestone/80" : "text-ink-soft"
                }`}
              >
                {shiftOptionLine(o)}
              </span>
            </button>
          );
        })}
      </div>

      <label className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-sans text-[12.5px] font-medium text-ink-soft">Or pick a time</span>
        <input
          type="datetime-local"
          value={custom}
          min={toLocalInput(nowUnix + 300)}
          onChange={(e) => setCustom(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-full bg-card px-3.5 font-sans text-[12.5px] font-semibold text-ink ring-1 ring-line focus:ring-aegean focus:outline-none"
        />
      </label>

      <button
        type="button"
        disabled={mutation.isPending || !commitUnix}
        onClick={() => commitUnix && mutation.mutate(commitUnix)}
        className="mt-3.5 inline-flex h-10 items-center rounded-full bg-aegean px-5 font-sans text-[13px] font-bold text-limestone transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {mutation.isPending
          ? "Moving the promise…"
          : commitUnix
            ? `Hold ${destinationLabel} by ${formatClock(commitUnix)} ${formatDayLabel(commitUnix, nowUnix)}`
            : "Pick a new time"}
      </button>

      {error ? (
        <p className="mt-2 font-sans text-[12.5px] font-medium text-ochre">{error}</p>
      ) : null}
    </div>
  );
}
