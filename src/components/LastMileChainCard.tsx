// Last-mile handoff card (Roam). Surfaces a Bolt / taxi handoff when the bus
// drops the rider far from the destination, or when they'd be walking
// through a sleeping Cyprus town after 21:00. Shared layout in
// mobility/MobilityCard.tsx.

import { useI18n } from "@/lib/i18n";
import type { LastMileChainSuggestion } from "@/lib/last-mile-chain.functions";
import { cleanPlace, MobilityCard, RangeValue } from "@/components/mobility/MobilityCard";

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtDist(m: number): { value: string; unit: "m" | "km" } {
  if (m < 1000) return { value: String(Math.round(m / 10) * 10), unit: "m" };
  return { value: (m / 1000).toFixed(m >= 10_000 ? 0 : 1), unit: "km" };
}

function fmtEur(n: number): string {
  return n >= 10 ? `€${Math.round(n)}` : `€${n.toFixed(1).replace(/\.0$/, "")}`;
}

export function LastMileChainCard({ suggestion }: { suggestion: LastMileChainSuggestion }) {
  const { t } = useI18n();

  const driveMin = fmtMin(suggestion.drivingSec);
  const walkMin = fmtMin(suggestion.walkSec);
  const dist = fmtDist(suggestion.distanceMeters);
  const toName = cleanPlace(suggestion.toName) || t("chain.toFallback");
  const fromName = cleanPlace(suggestion.fromName);

  const headline =
    suggestion.trigger === "long-late" || suggestion.trigger === "late-night"
      ? t("chain.titleAfterHours", { name: toName })
      : t("chain.titleLongWalk", { name: toName });

  return (
    <MobilityCard
      provider="bolt"
      name={t("mob.boltName")}
      mode={t("mob.boltRideMode")}
      aside={t("chain.vsWalk", { m: walkMin })}
      headline={headline}
      sub={fromName ? t("chain.fromLine", { name: fromName }) : undefined}
      stats={[
        { label: t("chain.driveLabel"), value: driveMin, unit: t("mob.minUnit") },
        {
          label: t("chain.distanceLabel"),
          value: dist.value,
          unit: dist.unit === "km" ? t("mob.kmUnit") : "m",
        },
        {
          label: t("chain.fareLabel"),
          value: (
            <RangeValue
              low={fmtEur(suggestion.fareLow)}
              high={fmtEur(suggestion.fareHigh)}
              joiner={t("mob.to")}
            />
          ),
        },
      ]}
      primary={{ href: suggestion.boltDeepLink, label: t("chain.openBolt"), external: true }}
      secondary={[
        { href: `tel:${suggestion.telDispatcher}`, label: t("mob.callTaxi"), icon: "phone" },
        {
          href: suggestion.mapsDeepLink,
          label: t("mob.maps"),
          icon: "map-trifold",
          external: true,
        },
      ]}
      note={suggestion.isNightRate ? t("mob.boltNightNote") : t("mob.boltDayNote")}
    />
  );
}
