import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "./api";

export type MobileWeather = {
  tempC: number;
  feelsLikeC: number;
  condition: string;
  iconKey: "sun" | "cloud" | "rain" | "storm" | "wind" | "moon";
  isDaytime: boolean;
};

export function useWeather(coords: { lat: number; lng: number } | null) {
  const lat = coords ? coords.lat.toFixed(2) : null;
  const lng = coords ? coords.lng.toFixed(2) : null;
  return useQuery<MobileWeather | null>({
    queryKey: ["weather", lat, lng],
    enabled: !!coords,
    staleTime: 10 * 60_000,
    refetchInterval: 15 * 60_000,
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/api/public/weather?lat=${coords!.lat}&lng=${coords!.lng}`,
      );
      if (!res.ok) return null;
      return (await res.json()) as MobileWeather | null;
    },
  });
}
