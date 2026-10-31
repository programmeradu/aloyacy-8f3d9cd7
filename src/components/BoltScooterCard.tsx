// Bolt e-scooter suggestion card (Nicosia), Roam layout. Shared pattern in
// mobility/MobilityCard.tsx: Bolt logo row, headline, compact stats,
// pick up and drop off zones, one primary button.

import { useI18n } from "@/lib/i18n";
import type { BoltScooterSuggestion } from "@/lib/bolt-scooter.functions";
import { cleanPlace, MobilityCard, MobilityStops } from "@/components/mobility/MobilityCard";

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtWalk(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function BoltScooterCard({ suggestion }: { suggestion: BoltScooterSuggestion }) {
  const { t } = useI18n();
  const rideMin = fmtMin(suggestion.rideSec);
  const totalMin = fmtMin(suggestion.totalSec);
  const savingsMin = fmtMin(suggestion.savingsSec);
  const rideKm = (suggestion.rideMeters / 1000).toFixed(1);
  const showSavings = suggestion.reason === "faster" && savingsMin >= 1;

  return (
    <MobilityCard
      provider="bolt"
      name={t("mob.boltName")}
      mode={t("mob.boltScooterMode")}
      aside={t("mob.doorAside", { m: totalMin })}
      headline={showSavings ? t("mob.scootSaves", { m: savingsMin }) : t("bolt.title")}
      sub={t("bolt.ridePace")}
      stats={[
        { label: t("mob.rideLabel"), value: rideMin, unit: t("mob.minUnit") },
        { label: t("mob.distanceLabel"), value: rideKm, unit: t("mob.kmUnit") },
        { label: t("mob.doorLabel"), value: totalMin, unit: t("mob.minUnit") },
      ]}
      primary={{ href: suggestion.appDeepLink, label: t("bolt.openBolt"), external: true }}
      secondary={[
        {
          href: suggestion.mapsDeepLink,
          label: t("bolt.openRoute"),
          icon: "map-trifold",
          external: true,
        },
      ]}
      note={t("bolt.disclaimer")}
    >
      <MobilityStops
        stops={[
          {
            label: t("mob.pickup"),
            name: cleanPlace(suggestion.pickup.name),
            meta: t("mob.zoneMeta", {
              walk: fmtWalk(suggestion.pickup.distanceM),
              n: suggestion.pickup.capacity,
            }),
          },
          {
            label: t("mob.dropoff"),
            name: cleanPlace(suggestion.dropoff.name),
            meta: t("mob.zoneMeta", {
              walk: fmtWalk(suggestion.dropoff.distanceM),
              n: suggestion.dropoff.capacity,
            }),
          },
        ]}
      />
    </MobilityCard>
  );
}
