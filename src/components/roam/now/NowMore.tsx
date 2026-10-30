// Below the fold on Now: nearby stops, the commute suggestion, the live and
// scheduled trips and arrival promises that used to live on Saved.
import { Link } from "@tanstack/react-router";
import type { Stop } from "@/components/StopCard";
import { CommuteSuggestionCard } from "@/components/CommuteSuggestionCard";
import { ActiveLiveTripCard } from "@/components/saved/ActiveLiveTripCard";
import { WatchTogetherButton } from "@/components/WatchTogetherButton";
import { useActiveTrip } from "@/lib/trip-store";
import { ScheduledDeparturesSection } from "@/components/saved/ScheduledDeparturesSection";
import { ArrivalPromisesSection } from "@/components/saved/ArrivalPromisesSection";
import { useRoamI18n } from "@/lib/roam-i18n";
import { Icon } from "../Icon";
import { ConfTag } from "../bits";

export function NowMore({ stops, live }: { stops: Stop[]; live: boolean }) {
  const active = useActiveTrip();
  const { r } = useRoamI18n();
  return (
    <section className="r-now-more" aria-label={r("now.more")}>
      <div className="r-now-grab" aria-hidden="true" />
      {stops.length > 0 ? (
        <>
          <h2 className="r-sec-lbl" style={{ marginTop: 8 }}>
            <span>{live ? r("now.stopsNear") : r("now.more")}</span>
            <Link to="/trips">{r("now.planTrip")}</Link>
          </h2>
          <div className="r-card" style={{ padding: "4px 0" }}>
            {stops.map((s) => {
              const isLive = s.etaTier === "live" || s.etaTier === "rider-confirmed";
              const codes = s.routes.map((x) => x.code).filter((c) => c !== "—");
              return (
                <Link key={s.id} to="/stop/$stopId" params={{ stopId: s.id }} className="r-row" style={{ ["--r-row-inset" as string]: "64px" }}>
                  <span className="r-icobox">
                    <Icon name="bus" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[16px] font-medium truncate">{s.name}</span>
                    <span className="r-lbl block truncate">{codes.length ? `${codes.slice(0, 5).join(" · ")} · ${s.towards}` : s.towards}</span>
                  </span>
                  <span className="text-right flex-none">
                    <span className="block r-tnum text-[16px] font-medium">{s.etaMin != null ? `${s.etaMin} ${r("now.min")}` : ""}</span>
                    {s.etaMin != null ? <ConfTag kind={isLive ? "live" : "tt"} /> : null}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}
      <div className="mt-4 space-y-4">
        <ActiveLiveTripCard />
        {active ? (
          <div className="r-legacy">
            <WatchTogetherButton
              origin={{ lat: active.from.lat, lng: active.from.lng, label: active.from.label }}
              destination={{ lat: active.to.lat, lng: active.to.lng, label: active.to.label }}
            />
          </div>
        ) : null}
        <ScheduledDeparturesSection />
        <ArrivalPromisesSection />
        <CommuteSuggestionCard />
      </div>
      <Link to="/saved" className="r-card r-row mt-4" style={{ minHeight: 60 }}>
        <span className="r-icobox">
          <Icon name="bookmark-simple" />
        </span>
        <span className="flex-1 text-[16px] font-medium">{r("me.saved")}</span>
        <Icon name="caret-right" size={16} style={{ color: "var(--r-mute)" }} />
      </Link>
    </section>
  );
}
