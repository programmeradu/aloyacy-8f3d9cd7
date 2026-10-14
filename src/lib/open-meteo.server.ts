// Current conditions from Open-Meteo (free, no key). Replaced Google Weather
// in Oct 2026. WMO weather codes are mapped onto the Google-style condition
// strings the existing UI helpers already understand (CLEAR, CLOUDY, RAIN,
// THUNDERSTORM, WINDY, ...), so callers did not change.

export type OpenMeteoNow = {
  tempC: number;
  feelsLikeC: number;
  /** Google-style condition code, upper case. */
  code: string;
  /** Plain English label. */
  label: string;
  isDaytime: boolean;
};

function wmoToCode(wmo: number, windKmh: number): { code: string; label: string } {
  if (wmo >= 95) return { code: "THUNDERSTORM", label: "Storm" };
  if ((wmo >= 51 && wmo <= 67) || (wmo >= 80 && wmo <= 82)) return { code: "RAIN", label: "Rain" };
  if ((wmo >= 71 && wmo <= 77) || wmo === 85 || wmo === 86) return { code: "SNOW", label: "Snow" };
  if (wmo === 45 || wmo === 48) return { code: "FOG", label: "Fog" };
  if (windKmh >= 40) return { code: "WINDY", label: "Windy" };
  if (wmo === 3) return { code: "CLOUDY", label: "Cloudy" };
  if (wmo === 2) return { code: "PARTLY_CLOUDY", label: "Partly cloudy" };
  if (wmo === 1) return { code: "MOSTLY_CLEAR", label: "Mostly clear" };
  return { code: "CLEAR", label: "Clear" };
}

export async function fetchOpenMeteoNow(
  lat: number,
  lng: number,
  timeoutMs = 6000,
): Promise<OpenMeteoNow | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        is_day?: number;
      };
    };
    const c = json.current;
    if (!c || typeof c.temperature_2m !== "number") return null;
    const { code, label } = wmoToCode(c.weather_code ?? 0, c.wind_speed_10m ?? 0);
    return {
      tempC: Math.round(c.temperature_2m),
      feelsLikeC: Math.round(c.apparent_temperature ?? c.temperature_2m),
      code,
      label,
      isDaytime: (c.is_day ?? 1) === 1,
    };
  } catch {
    return null;
  }
}
