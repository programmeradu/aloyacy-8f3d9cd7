// Wave 2.3 — Park & Ride card surfaced on /trips above the bus-only
// itinerary list when a hub interception genuinely helps.
//
// Editorial tone, no icons, no bullet dots: numerals carry the story.

import { useI18n } from "@/lib/i18n";
import type { ParkAndRideSuggestion } from "@/lib/park-and-ride.functions";

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtKm(m: number): string {
  return (m / 1000).toFixed(m >= 10_000 ? 0 : 1);
}

export function ParkAndRideCard({
  suggestion,
  origin,
}: {
  suggestion: ParkAndRideSuggestion;
  origin: { lat: number; lng: number };
}) {
  const { t } = useI18n();

  const driveMin = fmtMin(suggestion.driveSec);
  const busMin = fmtMin(suggestion.bus.durationSec);
  const totalMin = fmtMin(suggestion.totalSec);
  const driveKm = fmtKm(suggestion.driveMeters);

  const eyebrow =
    suggestion.reason === "faster"
      ? t("pnr.eyebrowFaster", { m: fmtMin(suggestion.savingsSec) })
      : suggestion.reason === "comfort"
        ? t("pnr.eyebrowComfort")
        : suggestion.reason === "traffic-jam"
          ? t("pnr.eyebrowTraffic", { m: fmtMin(suggestion.savingsSec) })
          : t("pnr.eyebrowOnly");

  const mapsHref = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${suggestion.hub.lat},${suggestion.hub.lng}&travelmode=driving`;

  // Live-traffic "why" line — only when the direct drive is genuinely worse
  // than free-flow. Numerals carry the story; no icons.
  const lt = suggestion.liveTraffic;
  const showWhy = lt?.notable === true;
  const trafficPct = lt ? Math.round(lt.severity * 100) : 0;
  const trafficDelayMin = lt ? fmtMin(lt.delaySec) : 0;
  const directDriveMin = lt ? fmtMin(lt.directDriveSec) : 0;

  return (
    <article className="rounded-[28px] bg-card ring-1 ring-line p-5 flex flex-col gap-4 animate-rise">
      <header className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-aegean-deep">
          {eyebrow}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
          {t("pnr.totalShort", { m: totalMin })}
        </p>
      </header>

      <h3 className="font-display text-[22px] leading-[1.15] text-ink text-balance">
        {t("pnr.title", { hub: suggestion.hub.label })}
      </h3>

      {showWhy && (
        <section className="rounded-2xl bg-ochre-soft/40 ring-1 ring-ochre/30 p-3.5 flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre-deep">
            {t("pnr.whyLabel")}
          </p>
          <p className="font-display text-[15px] leading-snug text-ink text-balance">
            {t("pnr.whyTrafficLine", {
              delay: trafficDelayMin,
              pct: trafficPct,
              direct: directDriveMin,
            })}
          </p>
        </section>
      )}

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-limestone-soft/60 p-3">
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ink-soft">
            {t("pnr.driveLabel")}
          </dt>
          <dd className="mt-1 font-display text-[26px] leading-none text-ink tabular-nums">
            {driveMin}
            <span className="ml-1 font-sans text-[12px] font-medium text-ink-soft">
              {t("common.minUnit")}
            </span>
          </dd>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
            {t("pnr.driveSub", { km: driveKm })}
          </p>
        </div>
        <div className="rounded-2xl bg-aegean-soft/40 p-3">
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
            {t("pnr.busLabel")}
          </dt>
          <dd className="mt-1 font-display text-[26px] leading-none text-ink tabular-nums">
            {busMin}
            <span className="ml-1 font-sans text-[12px] font-medium text-ink-soft">
              {t("common.minUnit")}
            </span>
          </dd>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft truncate">
            {suggestion.bus.firstRoute
              ? t("pnr.busSubRoute", {
                  route: suggestion.bus.firstRoute,
                  stop: suggestion.bus.boardName,
                })
              : t("pnr.busSubNoRoute", { stop: suggestion.bus.boardName })}
          </p>
        </div>
      </dl>

      {suggestion.hub.note && (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {suggestion.hub.note}
        </p>
      )}

      {suggestion.hub.ev && (
        <section className="rounded-2xl bg-olive-soft/40 ring-1 ring-olive/30 p-3.5 flex flex-col gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive-deep">
            {t("pnr.evLabel")}
          </p>
          <p className="font-display text-[15px] leading-snug text-ink text-balance">
            {t("pnr.evLine", {
              count: suggestion.hub.ev.count,
              kw: suggestion.hub.ev.kwMax,
              kind: t(
                suggestion.hub.ev.kind === "dc"
                  ? "pnr.evKindDc"
                  : "pnr.evKindAc",
              ),
              network: suggestion.hub.ev.network,
            })}
          </p>
          <p className="font-sans text-[12px] leading-snug text-ink-soft">
            {t("pnr.evHint")}
          </p>
        </section>
      )}


      <a
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start rounded-full bg-ink px-4 py-2.5 font-sans text-[13px] font-semibold text-limestone transition-colors hover:bg-aegean-deep"
      >
        {t("pnr.openDrive")}
      </a>
    </article>
  );
}
