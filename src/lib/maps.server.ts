// Server-only Google Maps gateway wrappers (Places New, Geocoding, Routes).
// All requests go through the Lovable connector gateway — never call Google directly.

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

function authHeaders(extra: Record<string, string> = {}) {
  const lk = process.env.LOVABLE_API_KEY;
  const gk = process.env.GOOGLE_MAPS_API_KEY;
  if (!lk) throw new Error("LOVABLE_API_KEY missing");
  if (!gk) throw new Error("GOOGLE_MAPS_API_KEY missing");
  return {
    Authorization: `Bearer ${lk}`,
    "X-Connection-Api-Key": gk,
    "Content-Type": "application/json",
    ...extra,
  };
}

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export async function placesAutocomplete(
  input: string,
  bias?: { lat: number; lng: number; radiusMeters?: number },
): Promise<PlaceSuggestion[]> {
  if (!input.trim()) return [];
  const body: Record<string, unknown> = {
    input,
    includedRegionCodes: ["cy"],
    languageCode: "en",
  };
  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: bias.radiusMeters ?? 30000,
      },
    };
  }
  const res = await fetch(`${GATEWAY}/places/v1/places:autocomplete`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`autocomplete ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        structuredFormat?: {
          mainText?: { text: string };
          secondaryText?: { text: string };
        };
        text?: { text: string };
      };
    }[];
  };
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      placeId: p.placeId,
      primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

export type ResolvedPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export async function resolvePlace(placeId: string): Promise<ResolvedPlace> {
  const res = await fetch(`${GATEWAY}/places/v1/places/${placeId}`, {
    method: "GET",
    headers: authHeaders({
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    }),
  });
  if (!res.ok) throw new Error(`place ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
  };
  return {
    placeId: json.id,
    name: json.displayName?.text ?? json.formattedAddress ?? "Unknown",
    address: json.formattedAddress ?? "",
    lat: json.location?.latitude ?? 0,
    lng: json.location?.longitude ?? 0,
  };
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url =
    `${GATEWAY}/maps/api/geocode/json?latlng=${lat},${lng}&result_type=street_address|premise|route`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`reverse ${res.status}`);
  const json = (await res.json()) as {
    results?: { formatted_address: string }[];
  };
  return json.results?.[0]?.formatted_address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export type WalkSegment = {
  durationSec: number;
  distanceMeters: number;
  polyline: string; // encoded
};

export async function walkingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<WalkSegment | null> {
  const res = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
    method: "POST",
    headers: authHeaders({
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    }),
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: "WALK",
      languageCode: "en",
      units: "METRIC",
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    routes?: {
      duration: string;
      distanceMeters: number;
      polyline?: { encodedPolyline: string };
    }[];
  };
  const r = json.routes?.[0];
  if (!r) return null;
  return {
    durationSec: parseInt(r.duration.replace("s", ""), 10) || 0,
    distanceMeters: r.distanceMeters,
    polyline: r.polyline?.encodedPolyline ?? "",
  };
}
