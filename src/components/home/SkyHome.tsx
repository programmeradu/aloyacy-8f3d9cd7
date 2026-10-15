// Sky Clock glass home (Explore, `/`). Port of the approved concept
// (concepts/a12.html). Real data only: see useNextBus.ts for sources.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PasskeyEnrollPrompt } from "@/components/PasskeyEnrollPrompt";
import { ResumeTripPill } from "@/components/ResumeTripPill";
import { CommuteSuggestionCard } from "@/components/CommuteSuggestionCard";
import { useNearbyStops } from "@/components/home/useNearbyStops";
import { useGeolocation } from "@/lib/useGeolocation";
import { getCurrentWeather } from "@/lib/weather.functions";
import { getStop, nearestStops } from "@/lib/gtfs";
import { useTick } from "@/hooks/use-tick";
import { LOCALES, useI18n, type Locale } from "@/lib/i18n";
import { Ph, type PhName } from "./SkyIcons";
import { NextBusCard } from "./NextBusCard";
import { SkySearchSheet } from "./SkySearchSheet";
import { SkyTabBar } from "./SkyTabBar";
import { useNextBus } from "./useNextBus";
import {
  badgeInk,
  conditionKey,
  deriveCardState,
  fmtCyprusTime,
  greetingKey,
  headline,
  timeOfDayKey,
} from "./sky-state";

const PICK_KEY = "aloya:home-stop";
const GEO_KEY = "aloya:geo";

const WX_ICON: Record<string, { name: PhName; color: string }> = {
  sun: { name: "sun", color: "#FFD27A" },
  moon: { name: "moon", color: "#E6E1FF" },
  cloud: { name: "cloud", color: "#E8ECF5" },
  rain: { name: "rain", color: "#BFD8FF" },
  storm: { name: "storm", color: "#FFE08A" },
  wind: { name: "wind", color: "#E8ECF5" },
};

export function SkyHome() {
  const { t, locale, setLocale } = useI18n();
  const geoHook = useGeolocation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useTick(30_000);

  // Location: the shared hook, plus an explicit re-ask from the card.
  const [override, setOverride] = useState<{ lat: number; lng: number } | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        status = s;
        setDenied(s.state === "denied");
        s.onchange = () => setDenied(s.state === "denied");
      })
      .catch(() => {});
    return () => {
      if (status) status.onchange = null;
    };
  }, []);
  const askLocation = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          localStorage.setItem(GEO_KEY, JSON.stringify({ ...c, ts: Date.now() }));
        } catch {}
        setOverride(c);
      },
      (err) => setDenied(err.code === err.PERMISSION_DENIED),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);
  const coords = override ?? geoHook.coords;
  const geoSource = override ? "live" : geoHook.source;

  // A stop picked by hand (no-location fallback) wins over GPS.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    try {
      setPicked(localStorage.getItem(PICK_KEY));
    } catch {}
  }, []);
  const pickStop = useCallback((id: string | null) => {
    setPicked(id);
    try {
      if (id) localStorage.setItem(PICK_KEY, id);
      else localStorage.removeItem(PICK_KEY);
    } catch {}
  }, []);

  const located = geoSource !== "fallback";
  const nb = useNextBus({ coords, located, pickedStopId: picked });
  // Keeps the nearby-stop list + Smart ETA telemetry the old home produced.
  const stops = useNearbyStops(coords, 5);

  const state = deriveCardState({
    mounted,
    hasPickedStop: !!picked,
    geoSource,
    geoLoading: geoHook.loading && !override,
    geoDenied: denied,
    rtLoading: nb.rtLoading,
    rtError: nb.rtError,
    rtHasData: nb.rtHasData,
    offlineLoading: nb.offlineLoading,
    bus: nb.bus,
    nearestStop: nb.nearestStop,
  });

  // Weather (Open-Meteo via the existing server fn), quantised so GPS jitter doesn't refetch.
  const getWeather = useServerFn(getCurrentWeather);
  const wxKey = `${coords.lat.toFixed(2)}:${coords.lng.toFixed(2)}`;
  const { data: weather } = useQuery({
    queryKey: ["weather", wxKey],
    queryFn: () => getWeather({ data: { lat: coords.lat, lng: coords.lng } }),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
  const wx = weather ? (WX_ICON[weather.iconKey] ?? WX_ICON.sun) : null;

  const area = useMemo(() => {
    const pickedStop = picked && !located ? getStop(picked) : null;
    if (pickedStop) return pickedStop.name.split(/[·\-,]/)[0].trim();
    if (!located) return "Cyprus";
    const ref = nearestStops(coords, 1)[0];
    return ref ? ref.name.split(/[·\-,]/)[0].trim() : "Cyprus";
  }, [coords, located, picked]);

  const now = new Date();
  const greet = mounted ? t(greetingKey(now)) : t("sky.greet.morning");
  const head = headline(state, fmtCyprusTime);
  const sub =
    mounted && weather
      ? t("sky.line", { sky: t(conditionKey(weather.iconKey)), tod: t(timeOfDayKey(now)), area })
      : t("sky.lineNoWx", { area: mounted ? area : "Cyprus" });

  const [sheet, setSheet] = useState<{ mode: "search" | "pick"; voice: boolean } | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  const origin = { lat: coords.lat, lng: coords.lng, label: area };

  return (
    <div className="sky" lang={locale}>
      <div className="sky-backdrop" aria-hidden="true" />
      <div className="sky-col">
        <div className="sky-art" aria-hidden="true">
          <picture className="sky-bg">
            <source type="image/avif" srcSet="/home/sky-dawn-600.avif 600w, /home/sky-dawn-704.avif 704w" sizes="(max-width: 430px) 100vw, 430px" />
            <source type="image/webp" srcSet="/home/sky-dawn-600.webp 600w, /home/sky-dawn-704.webp 704w" sizes="(max-width: 430px) 100vw, 430px" />
            <img src="/home/sky-dawn-600.webp" alt="" width={600} height={936} fetchPriority="high" decoding="async" />
          </picture>
          <div className="sky-shade" />
        </div>

        <OfflineBanner />
        <main className="sky-main">
          <header className="sky-head">
            <div className="sky-top">
              <span className="sky-wm">aloya</span>
              <div className="sky-tr">
                <div className="g sky-chip tnum" role="img" aria-label={mounted && weather ? t("sky.weatherAria", { temp: Math.round(weather.tempC) }) : t("sky.weatherLoading")}>
                  {wx ? <Ph name={wx.name} size={18} style={{ color: wx.color }} /> : <span className="sky-sk" style={{ width: 18, height: 18, borderRadius: 9 }} />}
                  {mounted && weather ? `${Math.round(weather.tempC)}°` : "—°"}
                </div>
                <div className="g sky-seg" role="group" aria-label={t("sky.langAria")}>
                  {LOCALES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      aria-pressed={locale === l.code}
                      lang={l.code}
                      aria-label={l.label}
                      onClick={() => setLocale(l.code as Locale)}
                    >
                      {l.code === "en" ? "EN" : "ΕΛ"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="sky-gr">
              <h1>
                {greet}
                <br />
                {t(head.key, head.vars)}
              </h1>
              <p>{sub}</p>
            </div>
          </header>

          <NextBusCard
            state={state}
            picked={!!picked}
            origin={origin}
            onAllowLocation={askLocation}
            onPickStop={() => setSheet({ mode: "pick", voice: false })}
            onRetry={nb.refetch}
          />

          <div className="g sky-srch">
            <button type="button" className="q" onClick={() => setSheet({ mode: "search", voice: false })}>
              <Ph name="search" size={20} style={{ color: "rgba(255,255,255,.85)", marginRight: 10, flex: "none" }} />
              {t("sky.search.placeholder")}
            </button>
            <button type="button" className="sky-mic" aria-label={t("sky.search.mic")} onClick={() => setSheet({ mode: "search", voice: true })}>
              <Ph name="mic" size={20} />
            </button>
          </div>

          {nb.tiles.length > 0 ? (
            <div className="sky-near">
              {nb.tiles.map((tile) => {
                const eta = `${tile.etaMin} ${t("sky.card.min")}`;
                return (
                  <Link
                    key={`${tile.routeId}-${tile.dest}`}
                    to="/stop/$stopId"
                    params={{ stopId: tile.stopId }}
                    className="g sky-nt"
                    aria-label={t("sky.near.aria", { line: tile.line, dest: tile.dest, eta })}
                  >
                    <span className="sky-ln" style={{ background: tile.color, color: badgeInk(tile.color) }}>
                      {tile.line}
                    </span>
                    <span className="c">
                      <span className="dn">{tile.dest}</span>
                      <span className={`m tnum${tile.live ? " lv" : ""}`}>
                        {tile.etaMin} {t("sky.card.min")}
                        {tile.live ? ` · ${t("sky.near.live")}` : ""}
                      </span>
                    </span>
                    <Ph name="caret" size={14} style={{ color: "rgba(255,255,255,.5)", flex: "none" }} />
                  </Link>
                );
              })}
            </div>
          ) : null}

          {mounted && located ? (
            <section className="sky-sec" aria-labelledby="sky-stops-h">
              <h3 id="sky-stops-h">
                <span>{geoSource === "live" ? t("sky.near.stopsTitle") : t("home.lastKnown")}</span>
                <Link to="/trips">{t("home.planTrip")} →</Link>
              </h3>
              <div className="g dk sky-list">
                {stops.map((s) => {
                  const live = s.etaTier === "live" || s.etaTier === "rider-confirmed";
                  return (
                    <Link key={s.id} to="/stop/$stopId" params={{ stopId: s.id }} className="sky-row">
                      <span className="n">
                        <b>{s.name}</b>
                        <small>
                          {s.routes.map((r) => r.code).filter((c) => c !== "—").join(" · ") || s.towards}
                          {s.routes.some((r) => r.code !== "—") ? ` · ${s.towards}` : ""}
                        </small>
                      </span>
                      <span className={`e tnum${live ? " lv" : ""}`}>
                        {s.etaMin != null ? `${s.etaMin}′` : "—"}
                        {s.etaMin != null ? <small>{live ? t("sky.near.live") : t("sky.card.scheduled")}</small> : null}
                      </span>
                      <Ph name="caret" size={14} style={{ color: "rgba(255,255,255,.5)", flex: "none" }} />
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="sky-extra">
            <CommuteSuggestionCard />
          </div>
        </main>

        <PasskeyEnrollPrompt />
        <ResumeTripPill />
        <SkyTabBar />
      </div>

      <SkySearchSheet
        open={!!sheet}
        mode={sheet?.mode ?? "search"}
        voice={!!sheet?.voice}
        onClose={closeSheet}
        vehicles={nb.snapshot?.vehicles ?? []}
        coords={coords}
        onPickedStop={(id) => pickStop(id)}
        onUseNearest={() => pickStop(null)}
        hasPickedStop={!!picked}
      />
    </div>
  );
}
