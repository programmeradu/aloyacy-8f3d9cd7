// Places autocomplete + place details — backed by the same Google Places
// proxy the web app uses. Same suggestion shape, same resolved-place shape.
import { API_BASE } from "./api";

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type ResolvedPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export async function autocompletePlaces(args: {
  query: string;
  bias?: { lat: number; lng: number };
}): Promise<PlaceSuggestion[]> {
  const res = await fetch(`${API_BASE}/api/public/places-autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Autocomplete ${res.status}`);
  const json = (await res.json()) as { suggestions?: PlaceSuggestion[] };
  return json.suggestions ?? [];
}

export async function resolvePlace(placeId: string): Promise<ResolvedPlace> {
  const res = await fetch(`${API_BASE}/api/public/place`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ placeId }),
  });
  if (!res.ok) throw new Error(`Place ${res.status}`);
  return res.json();
}
