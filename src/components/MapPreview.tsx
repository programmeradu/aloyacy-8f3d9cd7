import { useMemo } from "react";
import cyprusMap from "@/assets/cyprus-map.jpg";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER } from "@/lib/gtfs";

// Map a lat/lng to 0–1 box coords, around a center with a span.
function project(
  lat: number,
  lng: number,
  center: { lat: number; lng: number },
  spanKm = 8,
) {
  const dLat = (lat - center.lat) * 111;
  const dLng = (lng - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
  const x = 0.5 + dLng / spanKm;
  const y = 0.5 - dLat / spanKm;
  return { x, y };
}

const TONES = ["aegean", "ochre", "olive"] as const;
const toneBg: Record<(typeof TONES)[number], string> = {
  aegean: "bg-aegean-deep",
  ochre: "bg-ochre",
  olive: "bg-olive",
};

export function MapPreview({
  height = "h-64",
  center = NICOSIA_CENTER,
  spanKm = 8,
}: {
  height?: string;
  center?: { lat: number; lng: number };
  spanKm?: number;
}) {
  const { data } = useRealtime();

  const pins = useMemo(() => {
    if (!data) return [];
    return data.vehicles
      .map((v) => {
        const p = project(v.lat, v.lng, center, spanKm);
        return { ...v, x: p.x, y: p.y };
      })
      .filter((p) => p.x > -0.05 && p.x < 1.05 && p.y > -0.05 && p.y < 1.05)
      .slice(0, 14);
  }, [data, center, spanKm]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[28px] ring-1 ring-line bg-limestone-soft ${height}`}
    >
      <img
        src={cyprusMap}
        alt="Cyprus map"
        loading="lazy"
        width={1024}
        height={1024}
        className="absolute inset-0 size-full object-cover opacity-95"
      />
      <div className="absolute inset-0 grain opacity-60" aria-hidden />

      {/* Center marker — "you" */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ top: "50%", left: "50%" }}
      >
        <span className="absolute inset-0 -m-1 rounded-full bg-aegean-deep/30 animate-pulse-ring" />
        <span className="relative block size-3 rounded-full bg-aegean-deep ring-[3px] ring-white shadow" />
      </div>

      {pins.map((p, i) => {
        const tone = TONES[i % TONES.length];
        return (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
            style={{ top: `${p.y * 100}%`, left: `${p.x * 100}%` }}
          >
            <div
              className={`mb-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-tight text-white shadow-sm ${toneBg[tone]}`}
              title={p.label}
            >
              {p.label || "•"}
            </div>
            <span
              className={`relative block size-2.5 rounded-full ring-2 ring-white shadow ${toneBg[tone]}`}
              style={{ transform: `rotate(${p.bearing}deg)` }}
            />
          </div>
        );
      })}

      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 backdrop-blur-md ring-1 ring-line">
        <span className="size-1.5 rounded-full bg-aegean-deep animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink">
          {data ? `${data.vehicles.length} live` : "Connecting…"}
        </span>
      </div>
      <div className="absolute bottom-3 right-3 rounded-full bg-white/85 backdrop-blur-md ring-1 ring-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        Nicosia · {spanKm.toFixed(1)} km
      </div>
    </div>
  );
}
