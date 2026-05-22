// Server function: current Cyprus weather via Google Weather API (gateway).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export type CurrentWeather = {
  tempC: number;
  feelsLikeC: number;
  condition: string;
  iconKey: "sun" | "cloud" | "rain" | "storm" | "wind" | "moon";
  isDaytime: boolean;
};

function mapCondition(code: string | undefined, isDay: boolean): {
  iconKey: CurrentWeather["iconKey"];
  label: string;
} {
  const c = (code ?? "").toUpperCase();
  if (c.includes("THUNDER")) return { iconKey: "storm", label: "Storm" };
  if (c.includes("RAIN") || c.includes("SHOWER") || c.includes("DRIZZLE"))
    return { iconKey: "rain", label: "Rain" };
  if (c.includes("WIND")) return { iconKey: "wind", label: "Windy" };
  if (c.includes("CLOUD") || c.includes("OVERCAST"))
    return { iconKey: "cloud", label: "Cloudy" };
  if (c.includes("CLEAR") || c.includes("SUNNY") || c === "MOSTLY_CLEAR")
    return isDay
      ? { iconKey: "sun", label: "Clear" }
      : { iconKey: "moon", label: "Clear" };
  return isDay
    ? { iconKey: "sun", label: "Clear" }
    : { iconKey: "moon", label: "Clear" };
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
    const lk = process.env.LOVABLE_API_KEY;
    const gk = process.env.GOOGLE_MAPS_API_KEY;
    if (!lk || !gk) return null;

    try {
      const url = `${GATEWAY}/weather/v1/currentConditions:lookup?location.latitude=${data.lat}&location.longitude=${data.lng}&unitsSystem=METRIC&languageCode=en`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${lk}`,
          "X-Connection-Api-Key": gk,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.warn(`[weather] upstream ${res.status}`);
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
      console.warn("[weather] failed", err);
      return null;
    }
  });
