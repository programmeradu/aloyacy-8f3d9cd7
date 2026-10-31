// Park and ride on Go results, in the shared Roam mobility layout
// (mobility/MobilityCard.tsx): parking tile row with a small "faster" pill,
// the headline, the full bus line, one stats row that never wraps, driving
// directions as the primary button with a bus pill beside it, and a quiet
// footnote. Sentence case, no eyebrows, no middle dots, no em or en dashes.

import { useI18n } from "@/lib/i18n";
import type { ParkAndRideSuggestion } from "@/lib/park-and-ride.functions";
import { cleanPlace, MobilityCard, type MobilityAction } from "@/components/mobility/MobilityCard";

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtKm(m: number): string {
  return (m / 1000).toFixed(m >= 10_000 ? 0 : 1);
}

/** "Strovolos City Hall" becomes "Strovolos": enough words to name the place. */
function shortPlace(name: string): string {
  const words = cleanPlace(name).split(/[\s,]+/).filter(Boolean);
  let out = "";
  for (const w of words) {
    out = out ? `${out} ${w}` : w;
    if (out.length >= 8) break;
  }
  return out;
}

export function ParkAndRideCard({
  suggestion,
  origin,
  destination,
}: {
  suggestion: ParkAndRideSuggestion;
  origin: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
}) {
  const { t } = useI18n();

  const driveMin = fmtMin(suggestion.driveSec);
  const busMin = fmtMin(suggestion.bus.durationSec);
  const totalMin = fmtMin(suggestion.totalSec);
  const driveKm = fmtKm(suggestion.driveMeters);
  const board = cleanPlace(suggestion.bus.boardName);
  const route = suggestion.bus.firstRoute;

  const aside =
    suggestion.reason === "faster" || suggestion.reason === "traffic-jam"
      ? t("pnr.asideFaster", { m: fmtMin(suggestion.savingsSec) })
      : suggestion.reason === "comfort"
        ? t("pnr.asideComfort")
        : t("pnr.asideOnly");

  const driveHref = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${suggestion.hub.lat},${suggestion.hub.lng}&travelmode=driving`;
  const secondary: MobilityAction[] = destination
    ? [
        {
          href: `https://www.google.com/maps/dir/?api=1&origin=${suggestion.hub.lat},${suggestion.hub.lng}&destination=${destination.lat},${destination.lng}&travelmode=transit`,
          label: t("pnr.busFrom", { stop: shortPlace(board) }),
          icon: "bus",
          external: true,
        },
      ]
    : [];

  // Live-traffic "why" line, only when the direct drive is genuinely worse
  // than free flow.
  const lt = suggestion.liveTraffic;
  const showWhy = lt?.notable === true;

  const ev = suggestion.hub.ev;
  const note = [suggestion.hub.note, t("pnr.liveNote")].filter(Boolean).join(" ");

  return (
    <MobilityCard
      provider="parkride"
      name={t("pnr.name")}
      mode={t("pnr.mode")}
      aside={aside}
      headline={t("pnr.title", { hub: cleanPlace(suggestion.hub.label) })}
      sub={
        route
          ? t("pnr.sub", { route, stop: board })
          : t("pnr.subNoRoute", { stop: board })
      }
      stats={[
        { label: t("pnr.statDrive", { km: driveKm }), value: driveMin, unit: t("common.minUnit") },
        {
          label: route ? t("pnr.statBus", { route }) : t("pnr.busLabel"),
          value: busMin,
          unit: t("common.minUnit"),
        },
        { label: t("pnr.statTotal"), value: totalMin, unit: t("common.minUnit") },
      ]}
      primary={{ href: driveHref, label: t("pnr.openDrive"), icon: "car", external: true }}
      secondary={secondary}
      note={note}
    >
      {showWhy && lt ? (
        <section className="flex flex-col gap-1 rounded-[18px] bg-[#fbf0d6] px-3.5 py-3">
          <p className="text-[13px] font-medium leading-[18px] text-[#171717]">
            {t("pnr.whyLabel")}
          </p>
          <p className="text-[14px] leading-[1.35] text-[#171717]">
            {t("pnr.whyTrafficLine", {
              delay: fmtMin(lt.delaySec),
              pct: Math.round(lt.severity * 100),
              direct: fmtMin(lt.directDriveSec),
            })}
          </p>
        </section>
      ) : null}

      {ev ? <EvRow ev={ev} /> : null}
    </MobilityCard>
  );
}

function EvRow({ ev }: { ev: NonNullable<ParkAndRideSuggestion["hub"]["ev"]> }) {
  const { t } = useI18n();
  const live = ev.live;
  // Prefer the live feed count when it exceeds our curated number (the feed
  // sometimes reports newly added bays first).
  const total = Math.max(ev.count, live?.total ?? 0);
  const kw = Math.max(ev.kwMax, live?.kwMax ?? 0);
  const kind = t(live?.kind === "dc" || ev.kind === "dc" ? "pnr.evKindDc" : "pnr.evKindAc");
  const network = live?.operator ?? ev.network;

  let fresh: string;
  const ageSec = live?.updatedUnix
    ? Math.max(0, Math.floor(Date.now() / 1000) - live.updatedUnix)
    : null;
  if (ageSec != null && ageSec <= 90) fresh = t("pnr.evFreshJust");
  else if (ageSec != null && ageSec <= 3600)
    fresh = t("pnr.evFreshMin", { m: Math.round(ageSec / 60) });
  else if (live && live.available === null) fresh = t("pnr.evNoLive");
  else fresh = t("pnr.evHint");

  return (
    <section className="flex flex-col gap-1 rounded-[18px] bg-[var(--r-pill,#eeeeea)] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium leading-[18px] text-[#171717]">{t("pnr.evLabel")}</p>
        {live ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#2a7a4f]">
            <span className="size-1.5 rounded-full bg-[#2a9c64] animate-pulse" aria-hidden />
            {t("pnr.evLiveBadge")}
          </span>
        ) : null}
      </div>
      <p className="text-[14px] leading-[1.35] text-[#171717]">
        {live && live.available !== null
          ? t("pnr.evLiveAvailable", { free: live.available, total, kw, kind, network })
          : t("pnr.evLine", { count: total, kw, kind, network })}
      </p>
      <p className="text-[12px] leading-4 text-[var(--r-mute,#6f6f6a)]">{fresh}</p>
    </section>
  );
}
