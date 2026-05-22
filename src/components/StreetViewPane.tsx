/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "@/lib/useGoogleMaps";

type Props = {
  lat: number;
  lng: number;
  heading: number;
  className?: string;
};

/**
 * Lightweight Street View panorama bound to a coordinate + heading.
 * Falls back to a neutral placeholder when no imagery exists nearby.
 */
export function StreetViewPane({ lat, lng, heading, className }: Props) {
  const { api } = useGoogleMaps();
  const elRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "empty">("loading");

  useEffect(() => {
    if (!api || !elRef.current) return;
    let disposed = false;
    const svc = new api.maps.StreetViewService();
    svc.getPanorama(
      { location: { lat, lng }, radius: 80, source: api.maps.StreetViewSource.OUTDOOR },
      (data, st) => {
        if (disposed) return;
        if (st !== api.maps.StreetViewStatus.OK || !data?.location?.pano) {
          setStatus("empty");
          return;
        }
        new api.maps.StreetViewPanorama(elRef.current!, {
          pano: data.location.pano,
          pov: { heading, pitch: 0 },
          zoom: 0.6,
          disableDefaultUI: true,
          clickToGo: false,
          scrollwheel: false,
          linksControl: false,
          showRoadLabels: false,
          motionTracking: false,
          motionTrackingControl: false,
        });
        setStatus("ok");
      },
    );
    return () => {
      disposed = true;
    };
  }, [api, lat, lng, heading]);

  return (
    <div className={`relative overflow-hidden bg-aegean-soft ${className ?? ""}`}>
      <div ref={elRef} className="absolute inset-0" />
      {status !== "ok" && (
        <div className="absolute inset-0 flex items-center justify-center bg-aegean-soft">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
            {status === "loading" ? "Loading street view…" : "Street view unavailable"}
          </span>
        </div>
      )}
    </div>
  );
}
