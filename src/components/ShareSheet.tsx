// Share a stop (or an airport's bus stop): the Roam share sheet with the 4:5
// stop card drawn on the Worker, carrying the live next bus when there is one.

import { RoamShareSheet, currentOrigin, shareCardUrl } from "@/components/RoamShareSheet";
import { useI18n } from "@/lib/i18n";

export type StopShareCtx = {
  stop: { id: string; code: string; name: string; agency: string };
  routes: { short: string }[];
  /** The soonest departure exactly as the stop page lists it; null when there is none. */
  next: {
    routeId: string;
    routeShort: string;
    etaMin: number;
    arrivalUnix: number;
    headsign: string | null;
  } | null;
  airport?: "lca" | "pfo";
  locale: "en" | "el";
  /** Path of the page being shared, e.g. "/stop/4237". */
  path: string;
};

type Props = { open: boolean; onClose: () => void; ctx: StopShareCtx };

const cleanName = (s: string) =>
  String(s ?? "")
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

export function ShareSheet({ open, onClose, ctx }: Props) {
  const { t } = useI18n();
  const n =
    ctx.next && Number.isFinite(ctx.next.etaMin) && ctx.next.etaMin >= 0 && ctx.next.etaMin <= 180
      ? ctx.next
      : null;
  const minutes = n ? Math.round(n.etaMin) : null;
  const imageUrl = open
    ? shareCardUrl(`/api/public/og/stop/${encodeURIComponent(ctx.stop.id)}`, {
        a: ctx.stop.agency,
        airport: ctx.airport,
        n: n?.routeId,
        m: minutes,
        t: n ? Math.round(n.arrivalUnix) : null,
        h: n?.headsign ? cleanName(n.headsign) : null,
      })
    : null;
  return (
    <RoamShareSheet
      open={open}
      onClose={onClose}
      title={ctx.airport ? t("share.airport.title") : t("share.title")}
      imageUrl={imageUrl}
      shareUrl={`${currentOrigin()}${ctx.path}`}
      shareText={buildShareText(ctx, n, minutes)}
      fileName={
        ctx.airport ? `aloya-airport-${ctx.airport}` : `aloya-stop-${ctx.stop.code || ctx.stop.id}`
      }
    />
  );
}

function hm(unix: number, el: boolean): string {
  return new Date(unix * 1000).toLocaleTimeString(el ? "el-GR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Nicosia",
  });
}

function buildShareText(
  ctx: StopShareCtx,
  n: StopShareCtx["next"],
  minutes: number | null,
): string {
  const el = ctx.locale === "el";
  const name = cleanName(ctx.stop.name);
  const lines: string[] = [];
  lines.push(ctx.airport ? name : el ? `Στάση ${name}` : `${name} bus stop`);
  if (n && minutes != null) {
    const when =
      minutes <= 0
        ? el
          ? "τώρα"
          : "now"
        : minutes <= 60
          ? el
            ? `σε ${minutes} λεπτά`
            : `in ${minutes} min`
          : el
            ? `στις ${hm(n.arrivalUnix, el)}`
            : `at ${hm(n.arrivalUnix, el)}`;
    lines.push(
      el ? `Επόμενο λεωφορείο ${n.routeShort} ${when}` : `Next bus ${n.routeShort} ${when}`,
    );
  }
  if (ctx.routes.length) {
    const codes = ctx.routes
      .slice(0, 6)
      .map((r) => r.short)
      .join(", ");
    lines.push(el ? `Γραμμές ${codes}` : `Lines ${codes}`);
  }
  lines.push(el ? "Ζωντανές αφίξεις στο Aloya" : "Live arrivals on Aloya");
  return lines.join("\n");
}
