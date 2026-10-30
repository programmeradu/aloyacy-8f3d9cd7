import { useEffect, useState } from "react";
import type { AnimatedBus } from "@/components/map/AnimatedBus";

type DebugRow = ReturnType<AnimatedBus["getDebug"]>;

/**
 * Live telemetry for every animated bus (ping age, mode, speed, correction).
 * Internal stress-testing surface used by /qa — never shown to riders.
 */
export function MapDebugPanel({
  busLayer,
}: {
  busLayer: React.RefObject<Map<string, AnimatedBus>>;
}) {
  const [rows, setRows] = useState<DebugRow[]>([]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const layer = busLayer.current;
      if (!layer) return;
      setRows(
        Array.from(layer.values())
          .map((b) => b.getDebug(now))
          .sort((a, b) => a.pingAgeMs - b.pingAgeMs),
      );
    }, 200);
    return () => window.clearInterval(id);
  }, [busLayer]);

  return (
    <div className="absolute top-3 left-3 max-h-[70%] w-[280px] overflow-y-auto rounded-2xl bg-ink/92 text-limestone backdrop-blur-md ring-1 ring-ink/30 p-3 font-mono text-[10px] leading-tight shadow-xl">
      <div className="flex items-baseline justify-between pb-2 mb-2 border-b border-limestone/15">
        <span className="uppercase tracking-[0.22em] text-limestone/60">Glide telemetry</span>
        <span className="text-ochre">{rows.length}</span>
      </div>
      {rows.length === 0 && <p className="text-limestone/50">no animated buses</p>}
      {rows.map((r) => {
        const age = r.pingAgeMs < 0 ? "-" : `${(r.pingAgeMs / 1000).toFixed(1)}s`;
        const ageWarn = r.pingAgeMs > 30_000;
        return (
          <div key={r.label} className="py-1.5 border-b border-limestone/10 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-limestone">{r.label}</span>
              <span className={ageWarn ? "text-ochre" : "text-limestone/60"}>{age}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-limestone/60">
              <span>
                <span className={r.mode === "path" ? "text-aegean" : "text-ochre"}>{r.mode}</span>
                {r.boarding ? " · stop" : r.stale ? " · stale" : ""}
              </span>
              <span>{r.speedKmh.toFixed(0)} km/h</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-limestone/45">
              <span>
                {r.hasPath
                  ? `${(r.alongM / 1000).toFixed(2)}/${(r.pathTotalM / 1000).toFixed(2)} km`
                  : "no shape"}
              </span>
              <span>{r.correctionVel !== 0 ? `±${r.correctionVel.toFixed(1)}m/s` : "-"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
