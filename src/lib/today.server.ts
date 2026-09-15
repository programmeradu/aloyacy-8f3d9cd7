// Live-signal fetchers for the "Cyprus today" briefing. Everything that
// touches the network or the database lives here; the copy composition itself
// is pure and tested in @aloya/core/today-brief.

import {
  composeTodayBriefing,
  cyprusNow,
  lookupByDay,
  pickLiveEvent,
  resolveFocus,
  selectFestival,
  selectMatchday,
  weatherIconKey,
  type CruiseToday,
  type Festival,
  type GreekWord,
  type RecurringFestival,
  type TodayBriefing,
  type TodayFact,
  type TodayInput,
  type VenuePattern,
  type Weather,
} from "@aloya/core/today-brief";
import facts from "@/data/cyprus-facts.json";
import nameDays from "@/data/cyprus-name-days.json";
import events from "@/data/cyprus-events.json";
import greekWords from "@/data/cyprus-greek-words.json";

async function fetchCyprusWeather(lat: number, lng: number): Promise<Weather> {
  try {
    const primaryKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY;
    const backupKey = process.env.GOOGLE_MAPS_BACKUP_KEY;
    const lk = process.env.LOVABLE_API_KEY;

    const directKeys = [primaryKey, backupKey].filter((k): k is string => Boolean(k && k.trim()));

    // 1. Direct Google Weather API
    for (const key of directKeys) {
      try {
        const url = `https://weather.googleapis.com/v1/currentConditions:lookup?location.latitude=${lat}&location.longitude=${lng}&unitsSystem=METRIC&languageCode=en&key=${key}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const json = (await res.json()) as {
            temperature?: { degrees?: number };
            weatherCondition?: { type?: string };
          };
          const code = (json.weatherCondition?.type ?? "").toUpperCase();
          return {
            tempC: Math.round(json.temperature?.degrees ?? 0),
            condition: code || "CLEAR",
            iconKey: weatherIconKey(code),
          };
        }
      } catch {}
    }

    // 2. Gateway fallback
    if (lk && primaryKey) {
      const url = `https://connector-gateway.lovable.dev/google_maps/weather/v1/currentConditions:lookup?location.latitude=${lat}&location.longitude=${lng}&unitsSystem=METRIC&languageCode=en`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": primaryKey },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        temperature?: { degrees?: number };
        weatherCondition?: { type?: string };
      };
      const code = (json.weatherCondition?.type ?? "").toUpperCase();
      return {
        tempC: Math.round(json.temperature?.degrees ?? 0),
        condition: code || "CLEAR",
        iconKey: weatherIconKey(code),
      };
    }
    return null;
  } catch {
    return null;
  }
}


/** Reads a fresh pulse_signals payload, or null when missing/stale. */
async function readSignal<T>(key: string, scope: string): Promise<T | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("pulse_signals")
      .select("payload, fetched_at, ttl_seconds")
      .eq("key", key)
      .eq("scope", scope)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const ttlMs = (Number(data.ttl_seconds) || 86_400) * 1000;
    if (Date.now() - Date.parse(data.fetched_at as string) > ttlMs) return null;
    return (data.payload ?? null) as T | null;
  } catch {
    return null;
  }
}

// Real Limassol port-calls feed (populated by /api/public/hooks/pulse-cruises).
// Returns null when stale or zero ships, so the home page never invents a
// cruise day.
async function cruiseInPortLive(): Promise<CruiseToday> {
  const p = await readSignal<{ count?: number; summary?: string; totalPassengers?: number }>(
    "cruises",
    "port-limassol",
  );
  if (!p) return null;
  const count = Number(p.count) || 0;
  if (count <= 0) return null;
  return {
    count,
    summary: typeof p.summary === "string" ? p.summary : null,
    totalPassengers: typeof p.totalPassengers === "number" ? p.totalPassengers : null,
  };
}

// Real visitcyprus.com events feed (populated by /api/public/hooks/pulse-events).
async function liveEventToday(d: Date, preferCity?: string): Promise<Festival | null> {
  const p = await readSignal<{ events?: Parameters<typeof pickLiveEvent>[1] }>("events", "island");
  if (!p) return null;
  return pickLiveEvent(d, Array.isArray(p.events) ? p.events : [], preferCity);
}

export async function buildTodayBriefing(input: TodayInput): Promise<TodayBriefing> {
  const d = cyprusNow();
  const { focus, wxLat, wxLng } = resolveFocus(input);
  const preferCity = focus.scope !== "island" ? focus.city : undefined;

  const [weather, cruise, liveEvent] = await Promise.all([
    fetchCyprusWeather(wxLat, wxLng),
    cruiseInPortLive(),
    liveEventToday(d, preferCity),
  ]);

  return composeTodayBriefing({
    date: d,
    focus,
    weather,
    cruise,
    fixture: selectMatchday(d, events.fixturesPattern.venues as VenuePattern[], preferCity),
    festival: liveEvent ?? selectFestival(d, events.recurring as RecurringFestival[]),
    holiday: lookupByDay(
      d,
      events.publicHolidays as unknown as Record<string, { en: string; el: string }>,
    ),
    nameDay: lookupByDay(
      d,
      nameDays as unknown as Record<string, { name: string; nameEl: string; scale: string }>,
    ),
    facts: facts as TodayFact[],
    greekWords: greekWords as GreekWord[],
  });
}
