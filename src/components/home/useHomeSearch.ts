import { useMemo } from "react";
import { searchAll } from "@aloya/core/home-search";
import { AIRPORTS } from "@/lib/airport.functions";
import { ROUTES, STOPS } from "@/lib/gtfs";
import { useI18n } from "@/lib/i18n";

type Vehicle = {
  id: string;
  tripId: string;
  routeId: string;
  label: string;
  lat: number;
  lng: number;
};

/**
 * Adapter around the pure `@aloya/core/home-search` ranking: feeds it the
 * static GTFS slices plus live vehicles, and localises the secondary lines.
 */
export function useHomeSearch(
  query: string,
  vehicles: Vehicle[],
  origin: { lat: number; lng: number },
) {
  const { t } = useI18n();
  return useMemo(
    () =>
      searchAll(query, {
        routes: ROUTES,
        stops: STOPS,
        airports: Object.values(AIRPORTS),
        vehicles,
        origin,
        labels: {
          intercity: t("home.intercity"),
          urban: t("home.urban"),
          kmAway: (km) => t("common.kmAway", { km: km.toFixed(1) }),
        },
      }),
    // `t` is stable per locale and locale changes re-render this hook's owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, vehicles, origin],
  );
}
