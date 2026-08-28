// One-tap stop condition. Silent when we don't know. One question at a time.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nextStopAsk, type StopAttribute, type StopConsensus } from "@aloya/core/stop-condition";
import { getDeviceId } from "@/lib/pwa";
import { useI18n } from "@/lib/i18n";

const CHIP_KEY: Record<
  string,
  | "stop.cond.shelterYes"
  | "stop.cond.shelterNo"
  | "stop.cond.seatingYes"
  | "stop.cond.seatingNo"
  | "stop.cond.stepFree"
> = {
  "has_shelter:yes": "stop.cond.shelterYes",
  "has_shelter:no": "stop.cond.shelterNo",
  "has_seating:yes": "stop.cond.seatingYes",
  "has_seating:no": "stop.cond.seatingNo",
  "wheelchair_access:yes": "stop.cond.stepFree",
};

const ASK_KEY: Record<string, "stop.cond.askShelter" | "stop.cond.askSeating"> = {
  has_shelter: "stop.cond.askShelter",
  has_seating: "stop.cond.askSeating",
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
  const report = useMutation({
    mutationFn: (input: { attribute: StopAttribute; value: "yes" | "no" }) =>
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
    .filter(
      (c): c is { key: (typeof CHIP_KEY)[string]; n: number; source: StopConsensus["source"] } =>
        c != null,
    );

  if (chips.length === 0 && !ask) return null;

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
      {ask && ASK_KEY[ask] && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink">{t(ASK_KEY[ask])}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={report.isPending}
              onClick={() => report.mutate({ attribute: ask, value: "yes" })}
              className="rounded-full bg-ink px-3 py-1.5 font-sans text-[12px] font-semibold text-limestone disabled:opacity-50"
            >
              {t("stop.cond.yes")}
            </button>
            <button
              type="button"
              disabled={report.isPending}
              onClick={() => report.mutate({ attribute: ask, value: "no" })}
              className="rounded-full bg-card px-3 py-1.5 font-sans text-[12px] font-semibold text-ink ring-1 ring-line disabled:opacity-50"
            >
              {t("stop.cond.no")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
