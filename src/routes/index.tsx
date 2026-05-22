import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { WeatherStamp } from "@/components/WeatherStamp";
import { MapPreview } from "@/components/MapPreview";
import { StopCard, type Stop } from "@/components/StopCard";
import { RouteChip } from "@/components/RouteChip";
import {
  IconSearch,
  IconSun,
  IconMoon,
  IconCloud,
  IconRain,
  IconWind,
  IconCrosshair,
  IconArrowUpRight,
  IconBus,
  IconPin,
} from "@/components/Icons";
import { useRealtime } from "@/lib/useRealtime";
import { useGeolocation } from "@/lib/useGeolocation";
import { useTick } from "@/hooks/use-tick";
import { getCurrentWeather } from "@/lib/weather.functions";
import {
  STOPS,
  ROUTES,
  nearestStops,
  getRoute,
  routeTone,
  distanceKm,
} from "@/lib/gtfs";
import { getGreeting } from "@/lib/greeting";
import statBus from "@/assets/stat-bus.png";
import statDial from "@/assets/stat-dial.png";
import statRoad from "@/assets/stat-road.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aloya — Cyprus bus, the way it should feel" },
      {
        name: "description",
        content:
          "Plan, track and ride Cyprus buses with a calm, intelligent interface. Live ETAs, nearby stops, smart routing.",
      },
      { property: "og:title", content: "Aloya — Cyprus transit" },
      {
        property: "og:description",
        content: "Mediterranean-light transit, redesigned.",
      },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/f1f21805-9e1e-4941-99d9-ecf6d4a5a633" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/f1f21805-9e1e-4941-99d9-ecf6d4a5a633" },
    ],
  }),
  component: Explore,
});

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEATHER_ICONS = {
  sun: IconSun,
  moon: IconMoon,
  cloud: IconCloud,
  rain: IconRain,
  storm: IconRain,
  wind: IconWind,
} as const;

function Explore() {
  const navigate = useNavigate();
  const geo = useGeolocation();
  const { data: rt } = useRealtime();
  const getWeather = useServerFn(getCurrentWeather);

  // Live local clock (Cyprus is Europe/Nicosia). Gated on mount to avoid SSR hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useTick(30_000); // re-render every 30s to refresh time-of-day label
  const now = new Date();
  const dayLabel = mounted ? DAY_NAMES[now.getDay()] : "—";

  // Weather — keyed on quantized coords so it doesn't refetch on every GPS jitter
  const wxKey = `${geo.coords.lat.toFixed(2)}:${geo.coords.lng.toFixed(2)}`;
  const { data: weather } = useQuery({
    queryKey: ["weather", wxKey],
    queryFn: () =>
      getWeather({ data: { lat: geo.coords.lat, lng: geo.coords.lng } }),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
  const WxIcon = weather ? WEATHER_ICONS[weather.iconKey] : IconSun;
  const wxTone = weather?.iconKey === "rain" || weather?.iconKey === "storm"
    ? "text-aegean-deep"
    : weather?.iconKey === "cloud"
      ? "text-ink-soft"
      : weather?.iconKey === "moon"
        ? "text-aegean-deep"
        : "text-ochre";

  // Search state
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchAll(query, rt?.vehicles ?? [], geo.coords),
    [query, rt, geo.coords],
  );

  // Geolocation-driven nearby stops with live ETAs
  const stops: Stop[] = useMemo(() => {
    const near = nearestStops(geo.coords, 5);
    const t = Math.floor(Date.now() / 1000);
    const arrByStop = new Map<string, { routeId: string; eta: number }[]>();
    if (rt) {
      for (const a of rt.arrivals) {
        const eta = Math.max(0, Math.round((a.arrivalUnix - t) / 60));
        if (eta > 120) continue;
        const arr = arrByStop.get(a.stopId) ?? [];
        arr.push({ routeId: a.routeId, eta });
        arrByStop.set(a.stopId, arr);
      }
    }

    return near.map((s, idx) => {
      const arrivals = (arrByStop.get(s.id) ?? []).sort(
        (a, b) => a.eta - b.eta,
      );
      const nextEta =
        arrivals[0]?.eta ?? Math.round(s.distanceKm * 14 + 3);
      const seen = new Set<string>();
      const routes = arrivals
        .filter((a) =>
          seen.has(a.routeId) ? false : (seen.add(a.routeId), true),
        )
        .slice(0, 3)
        .map((a) => {
          const r = getRoute(a.routeId);
          return { code: r?.short ?? "—", tone: routeTone(a.routeId) };
        });
      if (routes.length === 0)
        routes.push({ code: "—", tone: "olive" as const });
      return {
        id: s.id,
        code: s.code || s.id,
        name: s.name,
        towards:
          s.agency === "IC"
            ? "Intercity"
            : `${(s.distanceKm * 1000).toFixed(0)} m away`,
        etaMin: nextEta,
        routes,
        highlight: idx === 0,
      };
    });
  }, [rt, geo.coords]);

  // Nearby landmark chips — actual stops within range, clickable to stop page
  const landmarkChips = useMemo(() => {
    const near = nearestStops(geo.coords, 14).slice(0, 6);
    const seen = new Set<string>();
    return near
      .filter((s) => {
        const key = s.name.split(/[·\-,]/)[0].trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  }, [geo.coords]);

  const liveCount = rt?.vehicles.length ?? 0;
  const onTimePct = useMemo(() => {
    if (!rt) return null;
    const sampled = rt.arrivals.slice(0, 400);
    if (!sampled.length) return null;
    const ok = sampled.filter((a) => Math.abs(a.delaySec) <= 120).length;
    return Math.round((ok / sampled.length) * 100);
  }, [rt]);

  const headerArea = useMemo(() => {
    if (geo.source === "fallback") return "Cyprus";
    const ref = nearestStops(geo.coords, 1)[0];
    if (!ref) return "Cyprus";
    return ref.name.split(/[·\-,]/)[0].trim();
  }, [geo.coords, geo.source]);

  return (
    <AppShell>
      <header className="px-6 pt-3 pb-2 animate-rise">
        <div className="mb-7 flex items-start justify-between">
          <Logo />
          <WeatherStamp
            dayLabel={dayLabel}
            tempC={mounted && weather ? weather.tempC : null}
            iconKey={weather?.iconKey}
            Icon={WxIcon}
            tone={wxTone}
          />
        </div>


        <h1 className="font-display text-[40px] leading-[1.05] text-balance text-ink">
          {mounted ? getGreeting().word : "Kalimera."}
          <br />
          <span className="italic text-olive-soft">
            Where in {headerArea} today?
          </span>
        </h1>
      </header>

      <div className="relative z-50 px-6 mt-5 animate-rise" style={{ animationDelay: "80ms" }}>
        <SmartSearch
          query={query}
          setQuery={setQuery}
          results={results}
          onPickStop={(stopId) =>
            navigate({ to: "/stop/$stopId", params: { stopId } })
          }
          onPickRoute={() => navigate({ to: "/pulse" })}
          onPickVehicle={() => navigate({ to: "/pulse" })}
        />
      </div>

      <div
        className="mt-4 flex gap-2 overflow-x-auto no-scrollbar px-6 pb-1 animate-rise"
        style={{ animationDelay: "140ms" }}
      >
        {landmarkChips.length === 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft py-2">
            Locating…
          </span>
        ) : (
          landmarkChips.map((s, i) => {
            const tones = [
              "bg-aegean-soft/50 text-aegean-deep",
              "bg-olive/10 text-olive",
              "bg-ochre-soft/60 text-ochre",
            ];
            return (
              <Link
                key={s.id}
                to="/stop/$stopId"
                params={{ stopId: s.id }}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium tracking-tight transition-transform hover:-translate-y-0.5 ${tones[i % 3]}`}
              >
                {s.name.split(/[·\-,]/)[0].trim()}
              </Link>
            );
          })
        )}
      </div>

      <section
        className="px-6 mt-6 animate-rise"
        style={{ animationDelay: "200ms" }}
      >
        <MapPreview />
      </section>

      <section
        className="px-6 mt-5 grid grid-cols-3 gap-2 animate-rise"
        style={{ animationDelay: "260ms" }}
      >
        <QuickStat
          label="Live buses"
          value={liveCount ? String(liveCount) : "—"}
          tone="aegean"
          vignette={statBus}
          vignetteClass="right-0 bottom-0 w-[90%] opacity-[0.55] rotate-[-2deg]"
        />
        <QuickStat
          label="On-time"
          value={onTimePct !== null ? `${onTimePct}%` : "—"}
          tone="olive"
          vignette={statDial}
          vignetteClass="-right-1 -bottom-1 w-[78%] opacity-[0.45]"
        />
        <QuickStat
          label="Next ride"
          value={stops[0]?.etaMin != null ? `${stops[0].etaMin}′` : "—"}
          tone="ochre"
          vignette={statRoad}
          vignetteClass="right-0 bottom-0 w-[92%] opacity-[0.6]"
        />
      </section>


      <section
        className="mt-8 px-6 animate-rise"
        style={{ animationDelay: "320ms" }}
      >
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {geo.source === "live" ? (
                <IconCrosshair className="size-3 text-aegean-deep" />
              ) : (
                <IconPin className="size-3 text-ink-soft/60" />
              )}
              {geo.source === "live"
                ? "Around you, live feed"
                : geo.source === "cached"
                  ? "Last known location"
                  : "Around Nicosia centre"}
            </p>
            <h2 className="font-display text-3xl mt-1 text-ink">Nearby stops</h2>
          </div>
          <Link
            to="/trips"
            className="flex items-center gap-1 text-[12px] font-medium text-aegean-deep"
          >
            Plan a trip
            <IconArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          {stops.map((s) => (
            <StopCard key={s.id} stop={s} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function QuickStat({
  label,
  value,
  tone,
  vignette,
  vignetteClass,
}: {
  label: string;
  value: string;
  tone: "aegean" | "ochre" | "olive";
  vignette?: string;
  vignetteClass?: string;
}) {
  const c = {
    aegean: "text-aegean-deep",
    ochre: "text-ochre",
    olive: "text-olive",
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-line min-h-[88px]">
      {vignette && (
        <img
          src={vignette}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className={`pointer-events-none select-none absolute ${vignetteClass ?? ""}`}
          style={{
            maskImage:
              "radial-gradient(120% 100% at 100% 100%, oklch(0 0 0) 35%, transparent 78%)",
            WebkitMaskImage:
              "radial-gradient(120% 100% at 100% 100%, oklch(0 0 0) 35%, transparent 78%)",
          }}
        />
      )}
      <div className="relative p-3 flex flex-col h-full">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          {label}
        </p>
        <p className={`mt-auto pt-3 font-display text-2xl leading-none ${c}`}>{value}</p>
      </div>
    </div>
  );
}


/* ───────────────────────── Smart search ───────────────────────── */

type SearchResult =
  | {
      kind: "stop";
      id: string;
      name: string;
      sub: string;
      routes: string[];
    }
  | {
      kind: "route";
      id: string;
      code: string;
      name: string;
      liveCount: number;
    }
  | {
      kind: "vehicle";
      id: string;
      routeId: string;
      routeCode: string;
      label: string;
      sub: string;
    };

function searchAll(
  raw: string,
  vehicles: { id: string; routeId: string; label: string; lat: number; lng: number }[],
  origin: { lat: number; lng: number },
): SearchResult[] {
  const q = raw.trim().toLowerCase();
  if (q.length < 1) return [];
  const out: SearchResult[] = [];

  // Routes
  const matchedRoutes = ROUTES.filter(
    (r) =>
      r.short.toLowerCase() === q ||
      r.short.toLowerCase().startsWith(q) ||
      r.long.toLowerCase().includes(q),
  ).slice(0, 4);
  for (const r of matchedRoutes) {
    const live = vehicles.filter((v) => v.routeId === r.id).length;
    out.push({
      kind: "route",
      id: r.id,
      code: r.short,
      name: r.long,
      liveCount: live,
    });
  }

  // Vehicles by label / route
  if (q.length >= 1) {
    const vMatches = vehicles
      .filter((v) => {
        const r = getRoute(v.routeId);
        return (
          v.label?.toLowerCase().includes(q) ||
          r?.short.toLowerCase().startsWith(q) ||
          v.id.toLowerCase().includes(q)
        );
      })
      .slice(0, 4);
    for (const v of vMatches) {
      const r = getRoute(v.routeId);
      const d = distanceKm({ lat: v.lat, lng: v.lng }, origin);
      out.push({
        kind: "vehicle",
        id: v.id,
        routeId: v.routeId,
        routeCode: r?.short ?? "—",
        label: v.label || `Bus ${v.id}`,
        sub: `${d.toFixed(1)} km away`,
      });
    }
  }

  // Stops
  const stopMatches = STOPS.filter((s) =>
    s.name.toLowerCase().includes(q),
  ).slice(0, 6);
  for (const s of stopMatches) {
    out.push({
      kind: "stop",
      id: s.id,
      name: s.name,
      sub: s.agency === "IC" ? "Intercity" : "Urban",
      routes: [],
    });
  }

  return out.slice(0, 10);
}

function SmartSearch({
  query,
  setQuery,
  results,
  onPickStop,
  onPickRoute,
  onPickVehicle,
}: {
  query: string;
  setQuery: (s: string) => void;
  results: SearchResult[];
  onPickStop: (stopId: string) => void;
  onPickRoute: (routeId: string) => void;
  onPickVehicle: (routeId: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const open = focused && query.trim().length > 0;

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <span className="absolute left-4 text-ink-soft">
          <IconSearch className="size-4" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Stop, route number, or bus…"
          className="w-full rounded-2xl bg-card py-4 pl-11 pr-4 text-[15px] ring-1 ring-line placeholder:text-ink-soft/60 outline-none focus:ring-aegean-deep/30 transition-all"
        />
        {query.length === 0 && null}
        {query.length > 0 && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 rounded-full bg-limestone-soft px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft hover:text-ink"
          >
            clear
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-card ring-1 ring-line shadow-[0_24px_60px_-24px_oklch(0.22_0.012_110/0.25)] overflow-hidden">
          {results.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                No matches
              </p>
              <p className="mt-1 text-[13px] text-ink-soft">
                Try a route number like <span className="font-mono">120</span> or a place name.
              </p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-line">
              {results.map((r) => {
                if (r.kind === "route") {
                  return (
                    <li key={`r-${r.id}`}>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPickRoute(r.id)}
                        className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-limestone-soft transition-colors"
                      >
                        <RouteChip code={r.code} tone={routeTone(r.id)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] text-ink truncate">{r.name}</p>
                          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-0.5">
                            {r.liveCount > 0 ? `${r.liveCount} live` : "no live buses"}
                          </p>
                        </div>
                        <IconArrowUpRight className="size-3.5 text-ink-soft group-hover:text-aegean-deep" />
                      </button>
                    </li>
                  );
                }
                if (r.kind === "vehicle") {
                  return (
                    <li key={`v-${r.id}`}>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPickVehicle(r.routeId)}
                        className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-limestone-soft transition-colors"
                      >
                        <span className="flex size-9 items-center justify-center rounded-xl bg-aegean-soft/60 text-aegean-deep">
                          <IconBus className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] text-ink truncate">
                            Bus {r.label} <span className="text-ink-soft">line {r.routeCode}</span>
                          </p>
                          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-0.5">
                            {r.sub}
                          </p>
                        </div>
                        <IconArrowUpRight className="size-3.5 text-ink-soft group-hover:text-aegean-deep" />
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={`s-${r.id}`}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onPickStop(r.id)}
                      className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-limestone-soft transition-colors"
                    >
                      <span className="flex size-9 items-center justify-center rounded-xl bg-ochre-soft/70 text-ochre">
                        <IconPin className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-ink truncate">{r.name}</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-0.5">
                          {r.sub}
                        </p>
                      </div>
                      <IconArrowUpRight className="size-3.5 text-ink-soft group-hover:text-aegean-deep" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
