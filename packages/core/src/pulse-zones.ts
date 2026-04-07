// Canonical Cyprus zones used by every Pulse feed and the briefing assembler.
// One source of truth for coordinates so weather / marine / air / events all
// agree on what "Limassol" means.

export type PulseZone =
  | "nicosia"
  | "limassol"
  | "larnaca"
  | "paphos"
  | "famagusta"
  | "troodos"
  | "ayianapa"
  | "airport-lca"
  | "airport-pfo"
  | "port-limassol"
  | "coast"
  | "island";

export type ZoneSpec = {
  id: PulseZone;
  label: string;
  labelEl: string;
  lat: number;
  lng: number;
  /** Coastal zones get the marine + beach tiles. */
  coastal: boolean;
};

export const PULSE_ZONES: ZoneSpec[] = [
  { id: "nicosia",  label: "Nicosia",   labelEl: "Λευκωσία",  lat: 35.1856, lng: 33.3823, coastal: false },
  { id: "limassol", label: "Limassol",  labelEl: "Λεμεσός",   lat: 34.7071, lng: 33.0226, coastal: true },
  { id: "larnaca",  label: "Larnaca",   labelEl: "Λάρνακα",   lat: 34.9229, lng: 33.6233, coastal: true },
  { id: "paphos",   label: "Paphos",    labelEl: "Πάφος",     lat: 34.7768, lng: 32.4245, coastal: true },
  { id: "famagusta",label: "Famagusta", labelEl: "Αμμόχωστος",lat: 35.1264, lng: 33.9416, coastal: true },
  { id: "troodos",  label: "Troodos",   labelEl: "Τρόοδος",   lat: 34.9180, lng: 32.8730, coastal: false },
  { id: "ayianapa", label: "Ayia Napa", labelEl: "Αγία Νάπα", lat: 34.9824, lng: 34.0117, coastal: true },
];

/** Resolve a rider lat/lng to the nearest editorial zone (great-circle approx). */
export function nearestZone(lat: number, lng: number): ZoneSpec {
  let best = PULSE_ZONES[0];
  let bestD = Infinity;
  for (const z of PULSE_ZONES) {
    const dLat = z.lat - lat;
    const dLng = (z.lng - lng) * Math.cos((lat * Math.PI) / 180);
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}
