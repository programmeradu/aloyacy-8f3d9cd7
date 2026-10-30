// Stop screen map hero (Roam): the stop from above with its buses, the top
// shade and haze, and the frosted back, alerts and share buttons.
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { BackButton, FrostButton } from "@/components/roam/FrostButton";
import { openMeSheet } from "@/components/roam/me-store";
import { useRoamI18n } from "@/lib/roam-i18n";
import type { StaticStop } from "@/lib/gtfs";

export function StopHero({
  stop,
  tripIds,
  onShare,
}: {
  stop: StaticStop | null | undefined;
  tripIds: string[];
  onShare: () => void;
}) {
  const { r, t } = useRoamI18n();
  const center = stop ? { lat: stop.lat, lng: stop.lng } : undefined;
  return (
    <div className="r-hero-map r-mapwrap">
      <div className="r-map-fill">
        <MapPreview
          bare
          center={center ? { lat: center.lat - 0.0016, lng: center.lng } : undefined}
          spanKm={1.4}
          markers={
            stop
              ? ([
                  { lat: stop.lat, lng: stop.lng, kind: "origin", label: stop.name },
                ] as MapMarker[])
              : undefined
          }
          restrictTripIds={tripIds}
          fitToContent={false}
          attribBottom={64}
        />
      </div>
      <div className="r-shade-top" style={{ height: 150 }} />
      <div className="r-haze r-haze--tr" />
      <header className="r-hero-head">
        <BackButton label={r("back")} />
        <span className="flex-1" />
        <FrostButton
          icon="bell-simple"
          label={r("me.alerts")}
          onClick={() => openMeSheet("alerts")}
        />
        <FrostButton icon="share-network" label={t("share.openLabel")} onClick={onShare} />
      </header>
    </div>
  );
}
