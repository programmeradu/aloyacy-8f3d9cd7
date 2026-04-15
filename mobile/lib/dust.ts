// Saharan-dust / air-quality advisory for the rider's origin.
import { API_BASE } from "./api";

export type DustAdvisory = {
  zone: string;
  zoneLabel: string;
  zoneLabelEl: string;
  pm10: number | null;
  band: "good" | "fair" | "moderate" | "poor" | "very-poor" | null;
  severity: "haze" | "dust-front" | "heavy-dust" | "poor-air";
  headline: string;
  headlineEl: string;
  advice: string;
  adviceEl: string;
  observedAt: string;
};

export async function fetchDustAdvisory(args: {
  lat: number;
  lng: number;
}): Promise<DustAdvisory | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/public/dust-advisory?lat=${args.lat}&lng=${args.lng}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === "object" && "severity" in json ? json : null;
  } catch {
    return null;
  }
}
