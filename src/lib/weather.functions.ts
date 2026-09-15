// Server function: current Cyprus weather via Google Weather API (gateway).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createLogger } from "./logger";

const log = createLogger("weather");
const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export type CurrentWeather = {
  tempC: number;
  feelsLikeC: number;
  condition: string;
  iconKey: "sun" | "cloud" | "rain" | "storm" | "wind" | "moon";
  isDaytime: boolean;
};

function mapCondition(
  code: string | undefined,
  isDay: boolean,
): {
  iconKey: CurrentWeather["iconKey"];
  label: string;
} {
  const c = (code ?? "").toUpperCase();
  if (c.includes("THUNDER")) return { iconKey: "storm", label: "Storm" };
  if (c.includes("RAIN") || c.includes("SHOWER") || c.includes("DRIZZLE"))
    return { iconKey: "rain", label: "Rain" };
  if (c.includes("WIND")) return { iconKey: "wind", label: "Windy" };
  if (c.includes("CLOUD") || c.includes("OVERCAST")) return { iconKey: "cloud", label: "Cloudy" };
  if (c.includes("CLEAR") || c.includes("SUNNY") || c === "MOSTLY_CLEAR")
    return isDay ? { iconKey: "sun", label: "Clear" } : { iconKey: "moon", label: "Clear" };
  return isDay ? { iconKey: "sun", label: "Clear" } : { iconKey: "moon", label: "Clear" };
}

export const getCurrentWeather = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<CurrentWeather | null> => {
    const primaryKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY;
    const backupKey = process.env.GOOGLE_MAPS_BACKUP_KEY;
    const lk = process.env.LOVABLE_API_KEY;

    const directKeys = [primaryKey, backupKey].filter((k): k is string => Boolean(k && k.trim()));
    if (directKeys.length === 0 && !lk) return null;

    // 1. Direct Google Weather API lookup
    for (const key of directKeys) {
      try {
        const url = `https://weather.googleapis.com/v1/currentConditions:lookup?location.latitude=${data.lat}&location.longitude=${data.lng}&unitsSystem=METRIC&languageCode=en&key=${key}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const json = (await res.json()) as {
            temperature?: { degrees?: number };
            feelsLikeTemperature?: { degrees?: number };
            weatherCondition?: { type?: string; description?: { text?: string } };
            isDaytime?: boolean;
          };
          const isDay = json.isDaytime ?? true;
          const mapped = mapCondition(json.weatherCondition?.type, isDay);
          return {
            tempC: Math.round(json.temperature?.degrees ?? 0),
            feelsLikeC: Math.round(json.feelsLikeTemperature?.degrees ?? 0),
            condition: json.weatherCondition?.description?.text ?? mapped.label,
            iconKey: mapped.iconKey,
            isDaytime: isDay,
          };
        }
        if (res.status >= 400 && res.status < 500 && res.status !== 403 && res.status !== 429) {
          log.warn("upstream error", { status: res.status });
          return null;
        }
      } catch (err) {
        log.warn("failed direct weather lookup", { err: err instanceof Error ? err.message : String(err) });
      }
    }

    // 2. Fall back to Lovable gateway if available
    if (lk && primaryKey) {
      try {
        const url = `${GATEWAY}/weather/v1/currentConditions:lookup?location.latitude=${data.lat}&location.longitude=${data.lng}&unitsSystem=METRIC&languageCode=en`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${lk}`,
            "X-Connection-Api-Key": primaryKey,
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          log.warn("upstream error", { status: res.status });
          return null;
        }
        const json = (await res.json()) as {
          temperature?: { degrees?: number };
          feelsLikeTemperature?: { degrees?: number };
          weatherCondition?: { type?: string; description?: { text?: string } };
          isDaytime?: boolean;
        };
        const isDay = json.isDaytime ?? true;
        const mapped = mapCondition(json.weatherCondition?.type, isDay);
        return {
          tempC: Math.round(json.temperature?.degrees ?? 0),
          feelsLikeC: Math.round(json.feelsLikeTemperature?.degrees ?? 0),
          condition: json.weatherCondition?.description?.text ?? mapped.label,
          iconKey: mapped.iconKey,
          isDaytime: isDay,
        };
      } catch (err) {
        log.warn("failed", { err: err instanceof Error ? err.message : String(err) });
        return null;
      }
    }

    return null;
  });
