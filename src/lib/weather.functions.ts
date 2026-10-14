// Server function: current Cyprus weather via Open-Meteo (free, no key).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createLogger } from "./logger";

const log = createLogger("weather");

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
    const { fetchOpenMeteoNow } = await import("./open-meteo.server");
    const now = await fetchOpenMeteoNow(data.lat, data.lng, 8000);
    if (!now) {
      log.warn("open-meteo unavailable");
      return null;
    }
    const mapped = mapCondition(now.code, now.isDaytime);
    return {
      tempC: now.tempC,
      feelsLikeC: now.feelsLikeC,
      condition: now.label || mapped.label,
      iconKey: mapped.iconKey,
      isDaytime: now.isDaytime,
    };
  });
