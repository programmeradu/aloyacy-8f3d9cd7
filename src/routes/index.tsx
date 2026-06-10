import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { WeatherStamp } from "@/components/WeatherStamp";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { MapPreview } from "@/components/MapPreview";
import { StopCard, type Stop } from "@/components/StopCard";
import { NLPlannerCard } from "@/components/NLPlannerCard";
import { CommuteSuggestionCard } from "@/components/CommuteSuggestionCard";
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
import { smartEtaV2 } from "@/lib/eta-v2";
import { getShapeForTripSync } from "@/lib/shapes";
import { useLearnedStatsBulk } from "@/lib/useLearnedStatsBulk";
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
  stopKind,
} from "@/lib/gtfs";
import { getGreeting } from "@/lib/greeting";
import statBus from "@/assets/stat-bus.png";
import statDial from "@/assets/stat-dial.png";
import statRoad from "@/assets/stat-road.png";
import { useI18n } from "@/lib/i18n";


import { getIsMarketingHost } from "@/lib/host.functions";
import { MarketingLanding } from "@/components/MarketingLanding";

export const Route = createFileRoute("/")({
  loader: async () => ({ marketing: await getIsMarketingHost() }),
  head: ({ loaderData }) => {
    const marketing = loaderData?.marketing ?? false;
    const url = marketing ? "https://aloyacy.live/" : "https://app.aloyacy.live/";
    const title = marketing
      ? "Aloya — Cyprus bus, redrawn"
      : "Aloya — Cyprus bus, the way it should feel";
    const description = marketing
      ? "A calm, intelligent navigation system for every bus in Cyprus. Live ETAs, smart routing, Motion-card ready."
      : "Plan, track and ride Cyprus buses with a calm, intelligent interface. Live ETAs, nearby stops, smart routing across the island.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: "https://app.aloyacy.live/og/og-home.jpg" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: "A rider's hand on a Cyprus bus window at golden hour, olive trees beyond." },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: "https://app.aloyacy.live/og/og-home.jpg" },
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "alternate", hrefLang: "en", href: url },
        { rel: "alternate", hrefLang: "el", href: url },
        { rel: "alternate", hrefLang: "x-default", href: url },
      ],
    };
  },
  component: IndexRoute,
});

function IndexRoute() {
  const { marketing } = Route.useLoaderData();
  // Defensive: trust the actual hostname on the client. Only aloyacy.live and
  // www.aloyacy.live ever render the marketing landing — every other host
  // (app.aloyacy.live, lovable previews, localhost) gets the app.
  const showMarketing = (() => {
    if (typeof window === "undefined") return marketing;
    const h = window.location.hostname.toLowerCase();
    return h === "aloyacy.live" || h === "www.aloyacy.live" || h === "aloya.cy" || h === "www.aloya.cy";
  })();
  return showMarketing ? <MarketingLanding /> : <Explore />;
}


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
  const { t: tt } = useI18n();


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
  const nearStops = useMemo(() => nearestStops(geo.coords, 5), [geo.coords]);
  const nearStopIds = useMemo(() => nearStops.map((s) => s.id), [nearStops]);
  const { data: learnedByStop } = useLearnedStatsBulk(nearStopIds);

  const stops: Stop[] = useMemo(() => {
    const near = nearStops;
    const t = Math.floor(Date.now() / 1000);
    // Index arrivals by stop for the route-chip list (cheap, no snap needed).
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

      // Smart ETA v2: snap the running vehicle onto its trip's GTFS shape,
      // factor in per-segment speeds, dwell, ping freshness, and learned bias.
      let smart: ReturnType<typeof smartEtaV2> = null;
      if (rt) {
        // Peek the next arrival at this stop to pick its shape.
        const nextHere = rt.arrivals
          .filter((a) => a.stopId === s.id && a.arrivalUnix >= t - 30)
          .sort((a, b) => a.arrivalUnix - b.arrivalUnix)[0];
        smart = smartEtaV2({
          stopId: s.id,
          arrivals: rt.arrivals,
          vehicles: rt.vehicles,
          nowSec: t,
          agency: s.agency,
          learnedByRoute: learnedByStop?.get(s.id),
          shape: nextHere ? getShapeForTripSync(nextHere.tripId, nextHere.routeId) : null,
        });
      }
      const nextEta = smart ? smart.etaMin : arrivals[0]?.eta ?? null;


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
            ? tt("home.intercity")
            : s.distanceKm >= 1
              ? tt("common.kmAway", { km: s.distanceKm.toFixed(s.distanceKm >= 10 ? 0 : 1) })
              : tt("common.mAway", { m: Math.round(s.distanceKm * 1000) }),


        etaMin: nextEta,
        etaConfidence: smart?.freshness,
        etaBlurb: smart?.blurb,
        routes,
        highlight: idx === 0,
        kind: stopKind(s),
      };
    });
  }, [rt, nearStops, learnedByStop]);

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
        <div className="mb-7 flex items-start justify-between gap-3">
          <div className="flex flex-col items-start gap-1.5">
            <Logo />
            <LocaleSwitcher />
          </div>
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
            {tt("home.whereToday", { area: headerArea })}
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
          onPickRoute={(routeId) => {
            navigate({ to: "/route/$routeId", params: { routeId } });
          }}
          onPickVehicle={(tripId) => {
            if (tripId) {
              navigate({ to: "/trip-info/$tripId", params: { tripId } });
              return;
            }
            const v = rt?.vehicles.find((x) => x.tripId === tripId);
            if (v?.routeId) navigate({ to: "/route/$routeId", params: { routeId: v.routeId } });
          }}
        />
      </div>

      <div
        className="mt-4 flex gap-2 overflow-x-auto no-scrollbar px-6 pb-1 animate-rise"
        style={{ animationDelay: "140ms" }}
      >
        {landmarkChips.length === 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft py-2">
            {tt("home.locating")}
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
        <MapPreview hideLiveBadge placeName={headerArea} />
      </section>

      <section
        className="px-6 mt-5 grid grid-cols-3 gap-2 animate-rise"
        style={{ animationDelay: "260ms" }}
      >
        <QuickStat
          label={tt("home.liveBuses")}
          value={liveCount ? String(liveCount) : "—"}
          tone="aegean"
          vignette={statBus}
          vignetteClass="right-1 bottom-1 w-[52%] opacity-[0.7] rotate-[-3deg]"
        />
        <QuickStat
          label={tt("home.onTime")}
          value={onTimePct !== null ? `${onTimePct}%` : "—"}
          tone="olive"
          vignette={statDial}
          vignetteClass="right-1 bottom-1 w-[46%] opacity-[0.6]"
        />
        <QuickStat
          label={tt("home.nextRide")}
          value={stops[0]?.etaMin != null ? `${stops[0].etaMin}′` : "—"}
          tone="ochre"
          vignette={statRoad}
          vignetteClass="right-1 bottom-1 w-[56%] opacity-[0.75]"
        />

      </section>


      <section
        className="mt-8 px-6 animate-rise"
        style={{ animationDelay: "300ms" }}
      >
        <NLPlannerCard />
      </section>

      <section
        className="mt-5 px-6 animate-rise"
        style={{ animationDelay: "310ms" }}
      >
        <CommuteSuggestionCard />
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
                ? tt("home.aroundYou")
                : geo.source === "cached"
                  ? tt("home.lastKnown")
                  : tt("home.aroundNicosia")}
            </p>
            <h2 className="font-display text-3xl mt-1 text-ink">{tt("home.nearbyStops")}</h2>
          </div>
          <Link
            to="/trips"
            className="flex items-center gap-1 text-[12px] font-medium text-aegean-deep"
          >
            {tt("home.planTrip")}
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
    <div className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-line">
      {vignette && (
        <img
          src={vignette}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className={`pointer-events-none select-none absolute ${vignetteClass ?? ""}`}
          style={{
            maskImage:
              "radial-gradient(110% 110% at 100% 100%, #000 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(110% 110% at 100% 100%, #000 30%, transparent 75%)",
          }}
        />
      )}
      <div className="relative p-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          {label}
        </p>
        <p className={`mt-1 font-display text-2xl leading-none ${c}`}>{value}</p>
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
      city: string;
      liveCount: number;
    }
  | {
      kind: "vehicle";
      id: string;
      tripId: string;
      routeId: string;
      routeCode: string;
      label: string;
      sub: string;
    };

const AGENCY_CITY: Record<string, string> = {
  NPT: "Nicosia",
  LMS: "Limassol",
  PFO: "Paphos",
  LCA: "Larnaca",
  FAM: "Famagusta",
  IC: "Intercity",
  SPC: "Intercity",
};
const AGENCY_RANK: Record<string, number> = {
  NPT: 0, LMS: 1, LCA: 2, PFO: 3, FAM: 4, IC: 5, SPC: 6,
};

function searchAll(
  raw: string,
  vehicles: { id: string; tripId: string; routeId: string; label: string; lat: number; lng: number }[],
  origin: { lat: number; lng: number },
): SearchResult[] {
  const q = raw.trim().toLowerCase();
  if (q.length < 1) return [];
  const out: SearchResult[] = [];

  // Routes — keep all matches across cities; rank exact short matches first, then by agency.
  const allMatched = ROUTES.filter(
    (r) =>
      r.short.toLowerCase() === q ||
      r.short.toLowerCase().startsWith(q) ||
      r.long.toLowerCase().includes(q),
  );
  const matchedRoutes = allMatched
    .map((r) => {
      const exact = r.short.toLowerCase() === q ? 0 : r.short.toLowerCase().startsWith(q) ? 1 : 2;
      return { r, exact, rank: AGENCY_RANK[r.agency] ?? 9 };
    })
    .sort((a, b) => a.exact - b.exact || a.rank - b.rank)
    .slice(0, 8)
    .map((x) => x.r);
  for (const r of matchedRoutes) {
    const live = vehicles.filter((v) => v.routeId === r.id).length;
    out.push({
      kind: "route",
      id: r.id,
      code: r.short,
      name: r.long,
      city: AGENCY_CITY[r.agency] ?? r.agency,
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
        tripId: v.tripId,
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

  return out.slice(0, 18);
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
  onPickVehicle: (tripId: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const open = focused && query.trim().length > 0;
  const { t: tt } = useI18n();

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
          placeholder={tt("home.searchPlaceholder")}
          aria-label={tt("home.searchPlaceholder")}
          className="w-full rounded-2xl bg-card py-4 pl-11 pr-4 text-[15px] ring-1 ring-line placeholder:text-ink-soft/60 outline-none focus:ring-aegean-deep/30 transition-all"
        />
        {query.length === 0 && null}
        {query.length > 0 && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 rounded-full bg-limestone-soft px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft hover:text-ink"
          >
            {tt("home.clear")}
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-card ring-1 ring-line shadow-[0_24px_60px_-24px_oklch(0.22_0.012_110/0.25)] overflow-hidden">
          {results.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {tt("home.noMatches")}
              </p>
              <p className="mt-1 text-[13px] text-ink-soft">
                {tt("home.searchHint", { example: "120" })}
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
                            {r.city} · {r.liveCount > 0 ? `${r.liveCount} live` : "no live buses"}
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
                        onClick={() => onPickVehicle(r.tripId)}
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
