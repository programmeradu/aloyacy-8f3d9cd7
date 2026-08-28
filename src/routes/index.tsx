import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { WeatherStamp } from "@/components/WeatherStamp";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { MapPreview } from "@/components/MapPreview";
import { StopCard } from "@/components/StopCard";
import { NLPlannerCard } from "@/components/NLPlannerCard";
import { CommuteSuggestionCard } from "@/components/CommuteSuggestionCard";
import {
  IconSun,
  IconMoon,
  IconCloud,
  IconRain,
  IconWind,
  IconCrosshair,
  IconArrowUpRight,
  IconPin,
} from "@/components/Icons";
import { QuickStat } from "@/components/home/QuickStat";
import { SmartSearch } from "@/components/home/SmartSearch";
import { useHomeSearch } from "@/components/home/useHomeSearch";
import { useLandmarkChips, useNearbyStops } from "@/components/home/useNearbyStops";
import { useRealtime } from "@/lib/useRealtime";
import { useGeolocation } from "@/lib/useGeolocation";
import { useTick } from "@/hooks/use-tick";
import { getCurrentWeather } from "@/lib/weather.functions";
import { nearestStops } from "@/lib/gtfs";
import { getGreeting } from "@/lib/greeting";
import statBus from "@/assets/stat-bus.png";
import statDial from "@/assets/stat-dial.png";
import statRoad from "@/assets/stat-road.png";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => {
    const url = "https://app.aloya.cy/";
    const title = "Aloya — Cyprus bus, the way it should feel";
    const description =
      "Plan, track and ride Cyprus buses with a calm, intelligent interface. Live ETAs, nearby stops, smart routing across the island.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: "https://app.aloya.cy/og/og-home.jpg" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        {
          property: "og:image:alt",
          content: "A rider's hand on a Cyprus bus window at golden hour, olive trees beyond.",
        },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: "https://app.aloya.cy/og/og-home.jpg" },
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
  return <Explore />;
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
    queryFn: () => getWeather({ data: { lat: geo.coords.lat, lng: geo.coords.lng } }),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
  const WxIcon = weather ? WEATHER_ICONS[weather.iconKey] : IconSun;
  const wxTone =
    weather?.iconKey === "rain" || weather?.iconKey === "storm"
      ? "text-aegean-deep"
      : weather?.iconKey === "cloud"
        ? "text-ink-soft"
        : weather?.iconKey === "moon"
          ? "text-aegean-deep"
          : "text-ochre";

  const [query, setQuery] = useState("");
  const vehicles = useMemo(() => rt?.vehicles ?? [], [rt]);
  const results = useHomeSearch(query, vehicles, geo.coords);

  const stops = useNearbyStops(geo.coords, 5);
  const landmarkChips = useLandmarkChips(geo.coords);

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
            {tt("home.whereToday", { area: mounted ? headerArea : "Cyprus" })}
          </span>
        </h1>
      </header>

      <div className="relative z-50 px-6 mt-5 animate-rise" style={{ animationDelay: "80ms" }}>
        <SmartSearch
          query={query}
          setQuery={setQuery}
          results={results}
          onPickStop={(stopId) => navigate({ to: "/stop/$stopId", params: { stopId } })}
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
          onPickAirport={(code) => {
            navigate({ to: "/airport/$code", params: { code } });
          }}
          onPickPage={(path) => {
            if (path === "/green-line") navigate({ to: "/green-line" });
          }}
        />
      </div>

      <div
        className="mt-4 flex gap-2 overflow-x-auto no-scrollbar px-6 pb-1 animate-rise"
        style={{ animationDelay: "140ms" }}
      >
        {!mounted || landmarkChips.length === 0 ? (
          <span className="font-eyebrow text-[10px] uppercase tracking-[0.18em] text-ink-soft py-2">
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

      <section className="px-6 mt-6 animate-rise" style={{ animationDelay: "200ms" }}>
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

      <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "300ms" }}>
        <NLPlannerCard />
      </section>

      <section className="mt-5 px-6 animate-rise" style={{ animationDelay: "310ms" }}>
        <CommuteSuggestionCard />
      </section>

      <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "320ms" }}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="flex items-center gap-1.5 font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {mounted && geo.source === "live" ? (
                <IconCrosshair className="size-3 text-aegean-deep" />
              ) : (
                <IconPin className="size-3 text-ink-soft/60" />
              )}
              {!mounted
                ? tt("home.aroundNicosia")
                : geo.source === "live"
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
