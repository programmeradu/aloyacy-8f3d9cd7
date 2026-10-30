// Line detail map hero (Roam, concept 07): the line from above with its stops
// and live buses, top shade and haze, frosted back, star and share buttons.
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { BackButton, FrostButton } from "@/components/roam/FrostButton";
import { useRoamI18n } from "@/lib/roam-i18n";

export function RouteHero({
  markers,
  polyline,
  tripIds,
  spanKm,
  starred,
  onStar,
  onShare,
}: {
  markers: MapMarker[];
  polyline?: string;
  tripIds: string[];
  spanKm: number;
  starred: boolean;
  onStar: () => void;
  onShare: () => void;
}) {
  const { r } = useRoamI18n();
  return (
    <div className="r-hero-map r-mapwrap">
      <div className="r-map-fill">
        <MapPreview
          bare
          spanKm={spanKm}
          markers={markers}
          polyline={polyline}
          fitToContent={markers.length > 1}
          restrictTripIds={tripIds.length ? tripIds : undefined}
          attribBottom={64}
        />
      </div>
      <div className="r-shade-top" style={{ height: 150 }} />
      <div className="r-haze r-haze--tr" />
      <header className="r-hero-head">
        <BackButton label={r("back")} />
        <span className="flex-1" />
        <FrostButton
          icon="star"
          variant={starred ? "y" : "frost"}
          label={starred ? r("line.unstar") : r("line.star")}
          onClick={onStar}
        />
        <FrostButton icon="share-network" label={r("line.share")} onClick={onShare} />
      </header>
    </div>
  );
}
