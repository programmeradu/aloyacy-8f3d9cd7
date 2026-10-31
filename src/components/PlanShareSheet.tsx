// Share a trip plan: the Roam share sheet with the 4:5 plan card (the legs on
// the real map, each bus in its line colour) drawn on the Worker from the
// saved plan, so the picture matches the link preview.

import { RoamShareSheet, shareCardUrl } from "@/components/RoamShareSheet";
import { useI18n } from "@/lib/i18n";

export type PlanCardCtx = {
  originLabel: string;
  destinationLabel: string;
  departureUnix: number;
  arrivalUnix: number;
  totalDurationSec: number;
  transfers: number;
  routeShort: string | null;
  creatorName: string | null;
  locale: "en" | "el";
  /** Public plan link on the current origin, ".../plan/<token>". */
  url: string;
};

type Props = { open: boolean; onClose: () => void; ctx: PlanCardCtx };

export function PlanShareSheet({ open, onClose, ctx }: Props) {
  const { t } = useI18n();
  const token = /\/plan\/([A-Za-z0-9]+)/.exec(ctx.url)?.[1] ?? null;
  const dest =
    ctx.destinationLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "plan";
  return (
    <RoamShareSheet
      open={open}
      onClose={onClose}
      title={t("share.plan.cta")}
      imageUrl={open && token ? shareCardUrl(`/api/public/og/plan/${token}`) : null}
      shareUrl={ctx.url}
      shareText={buildText(ctx)}
      fileName={`aloya-plan-${dest}`}
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

function buildText(ctx: PlanCardCtx): string {
  const el = ctx.locale === "el";
  const lines: string[] = [];
  lines.push(el ? `Πλάνο για ${ctx.destinationLabel}` : `Plan to ${ctx.destinationLabel}`);
  if (!/^(your|current|my) location$/i.test(ctx.originLabel.trim()))
    lines.push(el ? `Από ${ctx.originLabel}` : `From ${ctx.originLabel}`);
  const dep = hm(ctx.departureUnix, el);
  const arr = hm(ctx.arrivalUnix, el);
  lines.push(el ? `Αναχώρηση ${dep}, άφιξη ${arr}` : `Leave ${dep}, arrive ${arr}`);
  if (ctx.routeShort) lines.push(el ? `Λεωφορείο ${ctx.routeShort}` : `Bus ${ctx.routeShort}`);
  return lines.join("\n");
}
