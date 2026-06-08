// Inline HUD card surfacing crowd / comfort prediction for the
// active ride. Polls /api route every 90 s; renders nothing when
// we have no data for this route. On intercity rides we additionally
// fold in current weather at the alight stop so the rider gets one
// consolidated comfort line ("Busy — and rain at arrival.").

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteLoad, type CrowdLevel } from "@/lib/crowd.functions";
import { getCurrentWeather, type CurrentWeather } from "@/lib/weather.functions";
import { trackImpression } from "@/lib/analytics";
import { useI18n, type DictKey } from "@/lib/i18n";

const COPY: Record<CrowdLevel, { line: DictKey; tone: string }> = {
  quiet: {
    line: "crowd.quiet",
    tone: "bg-olive-soft/40 ring-olive/25 text-olive",
  },
  moderate: {
    line: "crowd.moderate",
    tone: "bg-aegean-soft/40 ring-aegean/25 text-aegean-deep",
  },
  busy: {
    line: "crowd.busy",
    tone: "bg-ochre-soft/60 ring-ochre/30 text-ochre",
  },
  packed: {
    line: "crowd.packed",
    tone: "bg-ochre-soft ring-ochre/40 text-ochre",
  },
};

function useWeatherClause(w: CurrentWeather | null | undefined): string | null {
  const { t } = useI18n();
  if (!w) return null;
  if (w.iconKey === "storm") return t("crowd.weather.storm");
  if (w.iconKey === "rain") return t("crowd.weather.rain");
  if (w.iconKey === "wind") return t("crowd.weather.wind");
  if (w.tempC >= 33) return t("crowd.weather.hot", { temp: w.tempC });
  if (w.tempC <= 8) return t("crowd.weather.cold", { temp: w.tempC });
  return null;
}

const COPY: Record<CrowdLevel, { tag: string; line: string; tone: string }> = {
  quiet: {
    tag: "Comfort",
    line: "Plenty of seats — quiet ride.",
    tone: "bg-olive-soft/40 ring-olive/25 text-olive",
  },
  moderate: {
    tag: "Comfort",
    line: "Some seats free.",
    tone: "bg-aegean-soft/40 ring-aegean/25 text-aegean-deep",
  },
  busy: {
    tag: "Comfort",
    line: "Busy — standing likely.",
    tone: "bg-ochre-soft/60 ring-ochre/30 text-ochre",
  },
  packed: {
    tag: "Comfort",
    line: "Packed — consider the next bus if you can.",
    tone: "bg-ochre-soft ring-ochre/40 text-ochre",
  },
};

function weatherClause(w: CurrentWeather | null | undefined): string | null {
  if (!w) return null;
  if (w.iconKey === "storm") return "Storms at arrival — bring cover.";
  if (w.iconKey === "rain") return "Rain at arrival — bring cover.";
  if (w.iconKey === "wind") return "Windy at arrival.";
  if (w.tempC >= 33) return `Hot at arrival (${w.tempC}°).`;
  if (w.tempC <= 8) return `Cold at arrival (${w.tempC}°).`;
  return null;
}

export function CrowdHint({
  routeId,
  tripId,
  weatherAt,
}: {
  routeId: string;
  tripId?: string;
  /** When provided, fetch current weather here and fold into the comfort line. */
  weatherAt?: { lat: number; lng: number } | null;
}) {
  const fetchLoad = useServerFn(getRouteLoad);
  const fetchWeather = useServerFn(getCurrentWeather);

  const { data } = useQuery({
    queryKey: ["crowd", routeId, tripId ?? ""],
    queryFn: () => fetchLoad({ data: { routeId, tripId } }),
    staleTime: 90_000,
    refetchInterval: 90_000,
  });

  const { data: weather } = useQuery({
    queryKey: ["crowd-weather", weatherAt?.lat.toFixed(2), weatherAt?.lng.toFixed(2)],
    enabled: !!weatherAt,
    queryFn: () =>
      weatherAt
        ? fetchWeather({ data: { lat: weatherAt.lat, lng: weatherAt.lng } })
        : Promise.resolve(null),
    staleTime: 10 * 60_000,
  });

  const wClause = weatherClause(weather ?? null);
  const level = data?.level;
  useEffect(() => {
    if (level || wClause) {
      trackImpression(
        "ui:crowd-hint.impression",
        { level: level ?? null, weather: !!wClause, routeId },
        `crowd:${routeId}:${level ?? "none"}:${wClause ? "w" : "nw"}`,
      );
    }
  }, [level, wClause, routeId]);
  if (!level && !wClause) return null;

  // Crowd-only render path (no useful weather signal).
  if (!data?.level && wClause) {
    return (
      <section className="px-6 mt-3 animate-rise">
        <div className="rounded-[22px] ring-1 bg-aegean-soft/40 ring-aegean/25 px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep">
            Comfort
          </p>
          <p className="mt-1 text-[13px] text-ink">{wClause}</p>
        </div>
      </section>
    );
  }

  const c = COPY[data!.level!];
  const toneBg = c.tone.replace(/text-\S+/, "");
  const toneText = c.tone.match(/text-\S+/)?.[0] ?? "text-ink";

  return (
    <section className="px-6 mt-3 animate-rise">
      <div className={`rounded-[22px] ring-1 px-4 py-3 ${toneBg}`}>
        <p className={`font-mono text-[10px] uppercase tracking-[0.22em] ${toneText}`}>
          {c.tag}
        </p>
        <p className="mt-1 text-[13px] text-ink">
          {c.line}
          {wClause && <span className="text-ink-soft"> {wClause}</span>}
        </p>
        {data!.sample > 1 && (
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            From {data!.sample} recent riders
          </p>
        )}
      </div>
    </section>
  );
}
