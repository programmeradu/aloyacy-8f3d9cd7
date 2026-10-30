// Live trip pieces (Roam): the board-to-alight leg strip on the yellow dot
// timeline, and the Trip complete screen shown once the rider has arrived.
import { Link, useNavigate } from "@tanstack/react-router";
import { cyClock } from "@aloya/core/cy-time";
import { BOARDING_PAY, boardingPayKind, formatEur, isCyprusNight } from "@aloya/core/boarding-pay";
import { RoamPage } from "@/components/roam/RoamPage";
import { NotchCard } from "@/components/roam/NotchCard";
import { BackButton } from "@/components/roam/FrostButton";
import { Icon } from "@/components/roam/Icon";
import { useRoamI18n } from "@/lib/roam-i18n";
import { useI18n } from "@/lib/i18n";
import { distanceKm, getRoute, getStop } from "@/lib/gtfs";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import type { useSingleLegView } from "@/lib/useSingleLegView";

export type BusView = NonNullable<ReturnType<typeof useSingleLegView>["view"]>["bus"];

function clock(unix: number) {
  return cyClock(unix * 1000);
}

/** Board to alight on the yellow dot timeline (charcoal journey card). */
export function LegStrip({ bus, dark = false }: { bus: BusView; dark?: boolean }) {
  const mins = Math.max(1, Math.round((bus.alight.arrivalUnix - bus.board.departureUnix) / 60));
  const mute = dark ? "var(--r-onchar-mute)" : "var(--r-mute)";
  return (
    <div className={dark ? "" : "mt-5 rounded-[22px] bg-[#f3f3f0] px-4 py-4"}>
      <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 r-tnum">
        <span className="text-[14px]" style={{ color: mute }}>
          {clock(bus.board.departureUnix)}
        </span>
        <span className="text-center text-[16px] font-medium">{mins} min</span>
        <span className="text-[14px]" style={{ color: mute }}>
          {clock(bus.alight.arrivalUnix)}
        </span>
      </div>
      <div className="r-tl-line mt-2" style={{ height: 30 }} aria-hidden="true">
        <span className="ln" />
        <span className="e" style={{ left: 0 }} />
        <span className="e" style={{ right: 0 }} />
        <span
          className="absolute left-1/2 top-1/2 flex size-[30px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
          style={{ background: "var(--r-y)", color: "var(--r-ink)" }}
        >
          <Icon name="bus" size={16} />
        </span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 text-[14px]">
        <span className="min-w-0 flex-1">{bus.board.name}</span>
        <span className="min-w-0 flex-1 text-right">{bus.alight.name}</span>
      </div>
    </div>
  );
}

/** Trip complete (Roam): charcoal summary with the scoop and check, then the line card. */
export function TripComplete({ active, bus }: { active: ActiveTrip; bus: BusView }) {
  const { t, locale } = useI18n();
  const { r } = useRoamI18n();
  const navigate = useNavigate();
  const route = getRoute(bus.routeId);
  const payKind = boardingPayKind({ agency: route?.agency, short: bus.routeShort });
  const night = isCyprusNight(bus.board.departureUnix * 1000);
  const fare =
    payKind === "urban"
      ? formatEur(
          night ? BOARDING_PAY.urban.night.motionEur : BOARDING_PAY.urban.day.motionEur,
          true,
        )
      : null;
  const board = getStop(bus.board.stopId);
  const alight = getStop(bus.alight.stopId);
  const km = board && alight ? distanceKm(board, alight) : null;
  const date = new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Nicosia",
  }).format(new Date(bus.alight.arrivalUnix * 1000));
  const done = () => {
    clearActiveTrip();
    navigate({ to: "/" });
  };
  return (
    <RoamPage
      title={r("done.yourTrip")}
      left={<BackButton label={r("back")} variant="light" fallback="/" />}
      right={<span />}
    >
      <NotchCard
        fill="#262626"
        radius={28}
        shadow="drop-shadow(0 18px 30px rgba(0,0,0,.22))"
        className="r-rise text-white"
        notches={[{ edge: "bottom", cx: 0, center: true, width: 120, depth: 22 }]}
      >
        <div className="px-5 pt-5 pb-9">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="r-t1" style={{ color: "#fff" }}>
                {r("done.title")}
              </h1>
              <p className="r-lbl mt-1.5" style={{ color: "var(--r-onchar-mute)" }}>
                {date} · {route?.short ? `${t("stop.routeKicker")} ${route.short}` : bus.routeShort}
              </p>
            </div>
            <span
              className="flex size-11 items-center justify-center rounded-full"
              style={{ background: "var(--r-y)", color: "var(--r-ink)" }}
              aria-hidden="true"
            >
              <Icon name="check" size={22} />
            </span>
          </div>
          <div className="mt-6">
            <LegStrip bus={bus} dark />
          </div>
          {km != null && km > 0.2 ? (
            <div className="mt-3 flex justify-center">
              <span className="r-dpill r-tnum">≈ {km.toFixed(1)} km</span>
            </div>
          ) : null}
        </div>
      </NotchCard>

      <section className="r-card mt-4 overflow-hidden r-rise" style={{ animationDelay: "80ms" }}>
        <div className="px-5 pt-5">
          <p className="r-t2">
            {t("stop.routeKicker")} {bus.routeShort}
          </p>
          <p className="r-lbl mt-1">{active.to.label}</p>
        </div>
        <div className="flex justify-center py-2">
          <img
            src="/roam/bus-front.webp"
            alt=""
            width={220}
            height={190}
            loading="lazy"
            style={{ objectFit: "contain" }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pb-5">
          <p className="r-lbl">{t("hud.arrived.title", { name: active.to.label })}</p>
          {fare ? (
            <span className="r-pill r-pill--y r-tnum">
              <Icon name="credit-card" />
              {r("done.fare", { fare })}
            </span>
          ) : null}
        </div>
      </section>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={done}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--r-char)] text-[15px] font-semibold text-white"
        >
          {t("hud.arrived.done")}
        </button>
        <Link
          to="/trips"
          onClick={() => clearActiveTrip()}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-white text-[15px] font-semibold"
        >
          {t("trip.planNew")}
        </Link>
      </div>
    </RoamPage>
  );
}
