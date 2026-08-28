// D2 rider "it drove past me". Silent below two devices. Does not
// change the skip percentage. D4: one ask per ride — after condition
// and photo.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pickStopAsk } from "@aloya/core/stop-ask";
import { nextStopAsk, type StopConsensus } from "@aloya/core/stop-condition";
import { shouldAskStopPhoto } from "@aloya/core/stop-photo";
import {
  shouldAskSkipReport,
  shouldSpeakSkipReport,
  type SkipReportTally,
} from "@aloya/core/skip-report";
import { getDeviceId } from "@/lib/pwa";
import { useStopAskGate } from "@/lib/stop-ask-at";
import { useI18n } from "@/lib/i18n";

async function postReport(body: unknown): Promise<SkipReportTally> {
  const res = await fetch("/api/public/stop-skip-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`stop-skip-report ${res.status}`);
  const json = (await res.json()) as { tally?: SkipReportTally };
  return json.tally ?? { n: 0, deviceReported: false };
}

async function getPhoto(stopId: string): Promise<{ url: string } | null> {
  const res = await fetch("/api/public/stop-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "get", stopId }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { photo?: { url: string } | null };
  return json.photo ?? null;
}

export function StopSkipAsk({
  stopId,
  rows,
  inset,
}: {
  stopId: string;
  rows: StopConsensus[];
  inset?: boolean;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { open, markAsked } = useStopAskGate();
  const q = useQuery({
    queryKey: ["stop-skip-report", stopId],
    queryFn: () => postReport({ action: "get", stopId, deviceId: getDeviceId() }),
    staleTime: 60_000,
  });
  const photoQ = useQuery({
    queryKey: ["stop-photo", stopId],
    queryFn: () => getPhoto(stopId),
    staleTime: 60_000,
  });
  const tally = q.data ?? { n: 0, deviceReported: false };
  const speak = shouldSpeakSkipReport(tally.n);
  const condition = nextStopAsk(rows) != null;
  const photoWanted = shouldAskStopPhoto(nextStopAsk(rows), photoQ.data != null);
  const skipWanted = shouldAskSkipReport(tally.deviceReported);
  const ask =
    open &&
    pickStopAsk({ condition, photo: photoWanted, skipReport: skipWanted }) === "skipReport";
  const report = useMutation({
    mutationFn: () => postReport({ action: "report", stopId, deviceId: getDeviceId() }),
    onSuccess: (next) => {
      markAsked();
      qc.setQueryData(["stop-skip-report", stopId], next);
    },
  });
  if (!speak && !ask) return null;

  const body = (
    <div className={inset ? "mt-3" : undefined}>
      {speak ? (
        <p className="text-[13px] leading-snug text-ink">{t("stop.skipReport")}</p>
      ) : null}
      {ask ? (
        <div className={speak ? "mt-2" : undefined}>
          <p className="text-[13px] text-ink">{t("stop.skipReportAsk")}</p>
          <button
            type="button"
            disabled={report.isPending}
            onClick={() => report.mutate()}
            className="mt-2 rounded-full bg-ink px-3 py-1.5 font-sans text-[12px] font-semibold text-limestone disabled:opacity-50"
          >
            {t("stop.skipReportYes")}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (inset) return body;
  return (
    <section className="px-6 pb-5 animate-rise" style={{ animationDelay: "90ms" }}>
      {body}
    </section>
  );
}
