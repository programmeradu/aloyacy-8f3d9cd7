// One-tap stop condition. Silent when we don't know. One question at a time.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  nextStopAsk,
  stopAskChoices,
  type StopAttribute,
  type StopConsensus,
} from "@aloya/core/stop-condition";
import { StopPhoto } from "@/components/stop/StopPhoto";
import { StopSkipRate } from "@/components/stop/StopSkipRate";
import { getDeviceId } from "@/lib/pwa";
import { useI18n, type DictKey } from "@/lib/i18n";

const CHIP_KEY: Record<string, DictKey> = {
  "has_shelter:yes": "stop.cond.shelterYes",
  "has_shelter:no": "stop.cond.shelterNo",
  "has_seating:yes": "stop.cond.seatingYes",
  "has_seating:no": "stop.cond.seatingNo",
  "wheelchair_access:yes": "stop.cond.stepFree",
  "wheelchair_access:partial": "stop.cond.stepPartial",
  "wheelchair_access:no": "stop.cond.stepNo",
  "reachable_on_foot:yes": "stop.cond.walkYes",
  "reachable_on_foot:no_crossing": "stop.cond.walkNoCrossing",
  "reachable_on_foot:no_sidewalk": "stop.cond.walkNoSidewalk",
  "lighting:good": "stop.cond.lightGood",
  "lighting:poor": "stop.cond.lightPoor",
  "lighting:none": "stop.cond.lightNone",
  "has_sign:yes": "stop.cond.signYes",
  "has_sign:no": "stop.cond.signNo",
  "has_sign:wrong": "stop.cond.signWrong",
  "has_timetable:yes": "stop.cond.timetableYes",
  "has_timetable:no": "stop.cond.timetableNo",
  "has_timetable:wrong": "stop.cond.timetableWrong",
};

const ASK_KEY: Record<string, DictKey> = {
  has_shelter: "stop.cond.askShelter",
  has_seating: "stop.cond.askSeating",
  reachable_on_foot: "stop.cond.askWalk",
  lighting: "stop.cond.askLight",
  wheelchair_access: "stop.cond.askStep",
  has_sign: "stop.cond.askSign",
  has_timetable: "stop.cond.askTimetable",
};

const CHOICE_KEY: Record<string, DictKey> = {
  yes: "stop.cond.yes",
  no: "stop.cond.no",
  no_crossing: "stop.cond.noCrossing",
  no_sidewalk: "stop.cond.noSidewalk",
  good: "stop.cond.good",
  poor: "stop.cond.poor",
  none: "stop.cond.none",
  partial: "stop.cond.partial",
  wrong: "stop.cond.wrong",
};

async function postCondition(body: unknown): Promise<StopConsensus[]> {
  const res = await fetch("/api/public/stop-condition", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`stop-condition ${res.status}`);
  const json = (await res.json()) as { rows?: StopConsensus[] };
  return json.rows ?? [];
}

export function StopCondition({ stopId }: { stopId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["stop-condition", stopId],
    queryFn: () => postCondition({ action: "get", stopId }),
    staleTime: 60_000,
  });
  const rows = q.data ?? [];
  const ask = nextStopAsk(rows);
  const choices = ask ? (stopAskChoices(ask) ?? []) : [];
  const report = useMutation({
    mutationFn: (input: { attribute: StopAttribute; value: string }) =>
      postCondition({
        action: "report",
        deviceId: getDeviceId(),
        stopId,
        attribute: input.attribute,
        value: input.value,
      }),
    onSuccess: (next) => qc.setQueryData(["stop-condition", stopId], next),
  });
  const chips = rows
    .map((r) => {
      const key = CHIP_KEY[`${r.attribute}:${r.value}`];
      if (!key) return null;
      return { key, n: r.n, source: r.source };
    })
    .filter((c): c is { key: DictKey; n: number; source: StopConsensus["source"] } => c != null);

  if (chips.length === 0 && !ask) {
    return (
      <>
        <StopSkipRate stopId={stopId} />
        <StopPhoto stopId={stopId} rows={rows} />
      </>
    );
  }

  return (
    <section className="px-6 pb-5 animate-rise" style={{ animationDelay: "90ms" }}>
      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {chips.map((c) => (
            <li
              key={c.key}
              className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft leading-none"
            >
              <span aria-hidden className="h-2.5 w-px bg-aegean-deep/70" />
              {t(c.key)}
              {c.source === "riders" && c.n >= 2 ? (
                <span className="normal-case tracking-normal text-ink-soft/70">
                  {t("stop.cond.fromRiders", { n: c.n })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {ask && ASK_KEY[ask] && choices.length > 0 && (
        <div className="mt-3">
          <p className="text-[13px] text-ink">{t(ASK_KEY[ask])}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {choices.map((value, i) => (
              <button
                key={value}
                type="button"
                disabled={report.isPending}
                onClick={() => report.mutate({ attribute: ask, value })}
                className={
                  i === 0
                    ? "rounded-full bg-ink px-3 py-1.5 font-sans text-[12px] font-semibold text-limestone disabled:opacity-50"
                    : "rounded-full bg-card px-3 py-1.5 font-sans text-[12px] font-semibold text-ink ring-1 ring-line disabled:opacity-50"
                }
              >
                {t(CHOICE_KEY[value] ?? "stop.cond.yes")}
              </button>
            ))}
          </div>
        </div>
      )}
      <StopSkipRate stopId={stopId} inset />
      <StopPhoto stopId={stopId} rows={rows} inset />
    </section>
  );
}
