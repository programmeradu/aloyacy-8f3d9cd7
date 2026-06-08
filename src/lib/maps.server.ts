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

export type WalkStep = {
  instruction: string; // plain text, no HTML
  distanceMeters: number;
  durationSec: number;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  maneuver: string;
  polyline: string;
  /** suggested street-view heading from start → end, in degrees */
  heading: number;
};

export type WalkDirections = {
  durationSec: number;
  distanceMeters: number;
  polyline: string;
  steps: WalkStep[];
};

function bearing(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export async function walkingDirections(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  languageCode: string = "en",
): Promise<WalkDirections | null> {
  const res = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
    method: "POST",
    headers: authHeaders({
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps",
    }),
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: "WALK",
      languageCode,
      units: "METRIC",
    }),
  });
  if (!res.ok) return null;
  type Step = {
    distanceMeters?: number;
    staticDuration?: string;
    polyline?: { encodedPolyline: string };
    startLocation?: { latLng: { latitude: number; longitude: number } };
    endLocation?: { latLng: { latitude: number; longitude: number } };
    navigationInstruction?: { instructions?: string; maneuver?: string };
  };
  const json = (await res.json()) as {
    routes?: {
      duration: string;
      distanceMeters: number;
      polyline?: { encodedPolyline: string };
      legs?: { steps?: Step[] }[];
    }[];
  };
  const r = json.routes?.[0];
  if (!r) return null;
  const rawSteps = r.legs?.flatMap((l) => l.steps ?? []) ?? [];
  const steps: WalkStep[] = rawSteps.map((s) => {
    const start = {
      lat: s.startLocation?.latLng.latitude ?? 0,
      lng: s.startLocation?.latLng.longitude ?? 0,
    };
    const end = {
      lat: s.endLocation?.latLng.latitude ?? 0,
      lng: s.endLocation?.latLng.longitude ?? 0,
    };
    return {
      instruction:
        s.navigationInstruction?.instructions?.replace(/<[^>]+>/g, "") ??
        "Continue",
      distanceMeters: s.distanceMeters ?? 0,
      durationSec: parseInt((s.staticDuration ?? "0s").replace("s", ""), 10) || 0,
      start,
      end,
      maneuver: s.navigationInstruction?.maneuver ?? "straight",
      polyline: s.polyline?.encodedPolyline ?? "",
      heading: bearing(start, end),
    };
  });
  return {
    durationSec: parseInt(r.duration.replace("s", ""), 10) || 0,
    distanceMeters: r.distanceMeters,
    polyline: r.polyline?.encodedPolyline ?? "",
    steps,
  };
}

/** Live drive ETA from the bus's current position to the alight stop, using
 *  Google Routes API with traffic-aware routing. Cheap field mask — only
 *  duration + distance. Returns null on any error so callers can fall back
 *  to schedule + distance floor. */
export async function drivingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<{ durationSec: number; distanceMeters: number } | null> {
  try {
    const res = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: authHeaders({
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      }),
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        languageCode: "en",
        units: "METRIC",
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      routes?: { duration: string; distanceMeters: number }[];
    };
    const r = json.routes?.[0];
    if (!r) return null;
    return {
      durationSec: parseInt(r.duration.replace("s", ""), 10) || 0,
      distanceMeters: r.distanceMeters,
    };
  } catch (e) {
    console.warn("drivingRoute failed", e);
    return null;
  }
}


