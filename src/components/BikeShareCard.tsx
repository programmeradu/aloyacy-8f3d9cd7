// Nextbike bike-share suggestion card, Roam layout. Shared pattern in
// mobility/MobilityCard.tsx: Nextbike logo row, headline, compact stats,
// pick up and drop off stations, one primary button that opens the
// nextbike app at the pickup station.

import { useI18n } from "@/lib/i18n";
import type { BikeShareSuggestion } from "@/lib/bikeshare.functions";
import { cleanPlace, MobilityCard, MobilityStops } from "@/components/mobility/MobilityCard";

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtWalk(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function BikeShareCard({ suggestion }: { suggestion: BikeShareSuggestion }) {
  const { t } = useI18n();
  const rideMin = fmtMin(suggestion.rideSec);
  const totalMin = fmtMin(suggestion.totalSec);
  const savingsMin = fmtMin(suggestion.savingsSec);
  const rideKm = (suggestion.rideMeters / 1000).toFixed(1);
  const showSavings = suggestion.reason === "faster" && savingsMin >= 1;

  return (
    <MobilityCard
      provider="nextbike"
      name={t("mob.nextbikeName")}
      mode={t("mob.nextbikeMode", { city: suggestion.cityName })}
      aside={t("mob.doorAside", { m: totalMin })}
      headline={
        showSavings
          ? t("mob.cycleSaves", { m: savingsMin })
          : t("bike.title", { city: suggestion.cityName })
      }
      sub={t("bike.ridePace")}
      stats={[
        { label: t("mob.rideLabel"), value: rideMin, unit: t("mob.minUnit") },
        { label: t("mob.distanceLabel"), value: rideKm, unit: t("mob.kmUnit") },
        { label: t("mob.doorLabel"), value: totalMin, unit: t("mob.minUnit") },
      ]}
      primary={{
        href: suggestion.appDeepLink ?? suggestion.webDeepLink,
        label: t("bike.openNextbike"),
        external: true,
      }}
      secondary={[
        {
          href: suggestion.mapsDeepLink,
          label: t("bike.openRoute"),
          icon: "map-trifold",
          external: true,
        },
      ]}
      note={t("bike.disclaimer")}
    >
      <MobilityStops
        stops={[
          {
            label: t("mob.pickup"),
            name: cleanPlace(suggestion.pickup.name),
            meta: t("mob.bikesMeta", {
              walk: fmtWalk(suggestion.pickup.distanceM),
              n: suggestion.pickup.bikes,
            }),
          },
          {
            label: t("mob.dropoff"),
            name: cleanPlace(suggestion.dropoff.name),
            meta: t("mob.racksMeta", {
              walk: fmtWalk(suggestion.dropoff.distanceM),
              n: suggestion.dropoff.freeRacks,
            }),
          },
        ]}
      />
    </MobilityCard>
  );
}
