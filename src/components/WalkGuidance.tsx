// Turn-by-turn walking guidance card. Used by both the single-leg trip
// companion (initial walk to the stop / final walk to destination) and the
// multi-leg companion (every walk leg — initial, transfer, and final).
// Identical visual treatment in both places: a header with total time/dist,
// then a vertical list of `TurnStep` cards with Street View imagery.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWalkingDirections } from "@/lib/maps.functions";
import { MapPreview } from "@/components/MapPreview";
import { StreetViewSheet } from "@/components/StreetViewSheet";

type LatLng = { lat: number; lng: number };

export function WalkGuidance({
  from,
  to,
  title,
  className,
}: {
  from: LatLng;
  to: LatLng;
  title: string;
  className?: string;
}) {
  const fetchDirections = useServerFn(getWalkingDirections);
  const { data } = useQuery({
    queryKey: ["walk", from.lat, from.lng, to.lat, to.lng],
    queryFn: () => fetchDirections({ data: { from, to } }),
    staleTime: 10 * 60 * 1000,
  });
  const directions = data?.directions ?? null;
  if (!directions || directions.steps.length === 0) return null;
  return (
    <section className={className ?? "mt-6 px-6 animate-rise"}>
      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {Math.round(directions.durationSec / 60)} min —{" "}
          {directions.distanceMeters >= 1000
            ? `${(directions.distanceMeters / 1000).toFixed(1)} km`
            : `${Math.round(directions.distanceMeters)} m`}
        </span>
      </div>
      <ol className="space-y-3">
        {directions.steps.map((s, i) => (
          <TurnStep
            key={i}
            index={i + 1}
            instruction={s.instruction}
            distanceMeters={s.distanceMeters}
            maneuver={s.maneuver}
            lat={s.start.lat}
            lng={s.start.lng}
            heading={s.heading}
            last={i === directions.steps.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

export function TurnStep({
  index,
  instruction,
  distanceMeters,
  maneuver,
  lat,
  lng,
  heading,
  last,
}: {
  index: number;
  instruction: string;
  distanceMeters: number;
  maneuver: string;
  lat: number;
  lng: number;
  heading: number;
  last: boolean;
}) {
  const dist =
    distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(1)} km`
      : `${Math.round(distanceMeters)} m`;
  const maneuverLabel = (maneuver || "straight").replace(/[-_]/g, " ");
  const sv = `/api/public/streetview?lat=${lat}&lng=${lng}&heading=${Math.round(
    heading,
  )}&w=640&h=360&fov=85`;
  const [svFailed, setSvFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const canOpenViewer = !svFailed;
  return (
    <li className="overflow-hidden rounded-[24px] bg-card ring-1 ring-line">
      <button
        type="button"
        disabled={!canOpenViewer}
        onClick={() => canOpenViewer && setViewerOpen(true)}
        className="group relative block aspect-[16/9] w-full bg-limestone-soft text-left disabled:cursor-default"
        aria-label={canOpenViewer ? `Open street view: ${instruction}` : instruction}
      >
        {svFailed ? (
          <MapPreview
            height="absolute inset-0"
            center={{ lat, lng }}
            spanKm={0.3}
            liveVehicles={false}
            markers={[{ lat, lng, kind: "pin", tone: "aegean", label: instruction }]}
            fitToContent={false}
            fullscreenable={false}
          />
        ) : (
          <img
            src={sv}
            alt={`Street view: ${instruction}`}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
            onError={() => setSvFailed(true)}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-full bg-white/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
            {index.toString().padStart(2, "0")}
          </span>
          <span className="rounded-full bg-ink/85 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-limestone">
            {maneuverLabel}
          </span>
        </div>
        <div className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
          {dist}
        </div>
        {canOpenViewer && (
          <span className="absolute bottom-3 left-3 rounded-full bg-aegean px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-limestone opacity-0 transition group-hover:opacity-100">
            Tap to look around
          </span>
        )}
      </button>
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {last ? "Arrive" : "Then"}
        </span>
        <p className="flex-1 font-display text-lg leading-snug text-ink">
          {instruction}
        </p>
      </div>
      <StreetViewSheet
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        lat={lat}
        lng={lng}
        heading={heading}
        label={instruction}
      />
    </li>
  );
}
