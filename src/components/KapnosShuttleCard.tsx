// Kapnos Airport Shuttle on Go results, in the shared Roam mobility layout
// (mobility/MobilityCard.tsx): logo row, next coach headline, one stats row
// that never wraps, board and get off rows, first and last mile plans, then
// the timetable and booking. When the coach stop is not a reasonable walk we
// plan the city bus first or last mile instead of saying "take a bus or taxi".
// Sentence case, no eyebrows, no middle dots, no em or en dashes.

import { LegChain } from "@/components/roam/journey/JourneyParts";
import { useI18n } from "@/lib/i18n";
import type { KapnosSuggestion } from "@/lib/kapnos.functions";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/itinerary-types";
import { cleanPlace, MobilityStats, ProviderTile } from "@/components/mobility/MobilityCard";
import { Icon } from "@/components/roam/Icon";

const WALKABLE_M = 1_200;
const MUTE = "text-[var(--r-mute,#6f6f6a)]";
const PILL = "bg-[var(--r-pill,#eeeeea)]";

function walkParts(m: number): { value: string; unit: string } {
  if (m < 950) return { value: String(Math.round(m / 10) * 10), unit: "m" };
  return { value: (m / 1000).toFixed(1), unit: "km" };
}

function fmtWalk(m: number): string {
  const p = walkParts(m);
  return `${p.value} ${p.unit}`;
}

function fmtTime(s: string): string {
  return (s.split(" ")[1] ?? "").slice(0, 5);
}

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtDateChip(s: string, locale: string): string {
  const [date] = s.split(" ");
  const [Y, M, D] = date.split("-").map((n) => parseInt(n, 10));
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Nicosia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (today === date) return "";
  const [tY, tM, tD] = today.split("-").map((n) => parseInt(n, 10));
  const diffDays = Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(tY, tM - 1, tD)) / 86_400_000);
  if (diffDays === 1) return locale === "el" ? "Αύριο" : "Tomorrow";
  return new Intl.DateTimeFormat(locale === "el" ? "el-CY" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(Y, M - 1, D)));
}

/** Convert the route name "NICOSIA > LARNACA" to "Nicosia → Larnaca". */
function prettyRoute(name: string): string {
  return name
    .split(/\s*>\s*/)
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" → ");
}

function MiniItinerary({ itin }: { itin: Itinerary }) {
  const { t } = useI18n();
  const rides = itin.legs.filter((l): l is RideLeg => l.kind === "ride");
  const walk = itin.legs.find((l): l is WalkLeg => l.kind === "walk");
  const from = rides.length > 0 ? rides[0].board.name : walk?.from.name;
  const to = rides.length > 0 ? rides[rides.length - 1].alight.name : walk?.to.name;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <LegChain itinerary={itin} white />
        <span className={`text-[12px] ${MUTE} [font-variant-numeric:tabular-nums]`}>
          {t("kapnos.miniMeta", {
            m: fmtMin(itin.totalDurationSec),
            walk: fmtWalk(Math.round(itin.totalWalkMeters)),
          })}
        </span>
      </div>
      {from && to ? (
        <p className="text-[13px] leading-[1.35] text-[#171717]">
          {cleanPlace(from)} → {cleanPlace(to)}
        </p>
      ) : null}
    </div>
  );
}

function MilePlan({
  title,
  loading,
  loadingLabel,
  plan,
  openLabel,
  onOpen,
  none,
}: {
  title: string;
  loading?: boolean;
  loadingLabel: string;
  plan?: Itinerary | null;
  openLabel: string;
  onOpen?: () => void;
  none: string;
}) {
  return (
    <details className={`group rounded-[18px] ${PILL} px-3.5 py-3`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium leading-5 text-[#171717] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{title}</span>
        <Icon name="caret-down" size={15} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2.5">
        {loading ? (
          <p className={`text-[13px] leading-[1.35] ${MUTE}`}>{loadingLabel}</p>
        ) : plan ? (
          onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="w-full text-left focus-visible:outline-none"
              aria-label={openLabel}
            >
              <MiniItinerary itin={plan} />
              <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#171717]">
                {openLabel}
                <Icon name="arrow-up-right" size={14} />
              </span>
            </button>
          ) : (
            <MiniItinerary itin={plan} />
          )
        ) : (
          <p className={`text-[13px] leading-[1.35] ${MUTE}`}>{none}</p>
        )}
      </div>
    </details>
  );
}

export function KapnosShuttleCard({
  suggestion,
  firstMile,
  lastMile,
  firstMileLoading,
  lastMileLoading,
  onPlanFirstMile,
  onPlanLastMile,
}: {
  suggestion: KapnosSuggestion;
  firstMile?: Itinerary | null;
  lastMile?: Itinerary | null;
  firstMileLoading?: boolean;
  lastMileLoading?: boolean;
  onPlanFirstMile?: () => void;
  onPlanLastMile?: () => void;
}) {
  const { t, locale } = useI18n();
  const rideMin = fmtMin(suggestion.rideSec);
  const next = suggestion.departures[0];
  const dayChip = fmtDateChip(next.departLocal, locale);
  const pickup = cleanPlace(suggestion.pickup.name);
  const dropoff = cleanPlace(suggestion.dropoff.name);
  const walk = walkParts(suggestion.pickup.distanceM);

  const pickupFar = suggestion.pickup.distanceM > WALKABLE_M;
  const dropoffFar = suggestion.dropoff.distanceM > WALKABLE_M;

  return (
    <article className="r-mob animate-rise flex flex-col gap-3.5 rounded-[26px] bg-white px-[18px] pb-[18px] pt-4 text-[#171717]">
      <header className="flex min-w-0 items-center gap-3">
        <ProviderTile provider="kapnos" />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-5">Kapnos Airport Shuttle</p>
          <p className={`text-[13px] leading-[18px] ${MUTE}`}>{prettyRoute(suggestion.routeName)}</p>
        </div>
        {dayChip ? (
          <span className={`inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full ${PILL} px-2.5 text-[12px] font-medium`}>
            {dayChip}
          </span>
        ) : null}
      </header>

      <h3 className="text-balance text-[21px] font-medium leading-[1.2] tracking-[-0.015em]">
        {t("kapnos.headline", {
          depart: fmtTime(next.departLocal),
          arrive: fmtTime(next.arriveLocal),
        })}
      </h3>

      <MobilityStats
        stats={[
          { label: t("kapnos.statRide"), value: rideMin, unit: "min" },
          { label: t("kapnos.statWalk"), value: walk.value, unit: walk.unit },
          { label: t("kapnos.statFare"), value: next.priceFrom },
        ]}
      />

      <ul className="flex flex-col">
        <li className="flex min-w-0 items-start gap-3 py-2">
          <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-[var(--r-y,#f6b83c)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="break-words text-[14px] font-medium leading-5">{pickup}</p>
            <p className={`text-[12px] leading-4 ${MUTE}`}>
              {t("kapnos.boardMeta", { walk: fmtWalk(suggestion.pickup.distanceM) })}
            </p>
          </div>
        </li>
        <li className="flex min-w-0 items-start gap-3 border-t border-[var(--r-line,#e7e7e3)] py-2">
          <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-[#171717]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="break-words text-[14px] font-medium leading-5">{dropoff}</p>
            <p className={`text-[12px] leading-4 ${MUTE}`}>
              {t("kapnos.alightMeta", { walk: fmtWalk(suggestion.dropoff.distanceM) })}
            </p>
          </div>
        </li>
      </ul>

      {pickupFar ? (
        <MilePlan
          title={t("kapnos.firstMile.title", { stop: pickup })}
          loading={firstMileLoading}
          loadingLabel={t("kapnos.firstMile.loading")}
          plan={firstMile}
          openLabel={t("kapnos.firstMile.openPlan")}
          onOpen={onPlanFirstMile}
          none={t("kapnos.firstMile.none")}
        />
      ) : null}

      {dropoffFar ? (
        <MilePlan
          title={t("kapnos.lastMile.title", { stop: dropoff })}
          loading={lastMileLoading}
          loadingLabel={t("kapnos.lastMile.loading")}
          plan={lastMile}
          openLabel={t("kapnos.lastMile.openPlan")}
          onOpen={onPlanLastMile}
          none={t("kapnos.lastMile.none")}
        />
      ) : null}

      <details className="group">
        <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-[18px] ${PILL} px-3.5 py-3 text-[14px] font-medium leading-5 [&::-webkit-details-marker]:hidden`}>
          <span className="min-w-0">{t("kapnos.moreLabel")}</span>
          <Icon name="caret-down" size={15} className="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <ul className="flex flex-col">
            {suggestion.departures.map((d, i) => {
              const chip = fmtDateChip(d.departLocal, locale);
              const known = d.seatsAvailable != null;
              const seatsLow = known && d.seatsAvailable! > 0 && d.seatsAvailable! <= 8;
              const sold = known && d.seatsAvailable! <= 0;
              return (
                <li
                  key={`${d.tripId}-${d.departLocal}-${d.arriveLocal}`}
                  className={`flex items-baseline justify-between gap-3 py-2 ${
                    i > 0 ? "border-t border-[var(--r-line,#e7e7e3)]" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="text-[15px] font-medium [font-variant-numeric:tabular-nums]">
                      {fmtTime(d.departLocal)}
                    </span>
                    <span className={`text-[12px] ${MUTE} [font-variant-numeric:tabular-nums]`}>
                      {t("kapnos.arrivesAt", { time: fmtTime(d.arriveLocal) })}
                    </span>
                    {chip ? <span className="text-[12px] font-medium text-[#9a6b12]">{chip}</span> : null}
                  </div>
                  <span
                    className={`shrink-0 text-[12px] font-medium [font-variant-numeric:tabular-nums] ${
                      sold ? "text-red-700" : seatsLow ? "text-[#9a6b12]" : MUTE
                    }`}
                  >
                    {sold
                      ? t("kapnos.soldOut")
                      : known
                        ? t("kapnos.seatsLeft", { n: d.seatsAvailable! })
                        : d.priceFrom}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2">
            <a
              href={suggestion.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#171717] px-5 text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
            >
              {t("kapnos.bookCta")}
              <Icon name="arrow-up-right" size={17} />
            </a>
            <a
              href={suggestion.routeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full ${PILL} px-3 text-[14px] font-medium text-[#171717] transition-transform active:scale-[0.98]`}
            >
              <Icon name="calendar-blank" size={16} />
              {t("kapnos.timetableCta")}
            </a>
          </div>
        </div>
      </details>

      <p className={`text-[12px] leading-4 ${MUTE}`}>{t("kapnos.disclaimer")}</p>
    </article>
  );
}
