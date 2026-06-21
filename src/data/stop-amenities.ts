// Wave 2.2 — known stop amenities for accessibility-weighted routing
// and StopCard affordance chips.
//
// This is a hand-curated seed dataset for major Nicosia hubs and intercity
// stations. Unknown stops return `undefined` — we deliberately show NOTHING
// rather than guess, in line with Aloya's "if we don't know, we say we
// don't know" principle.
//
// When we ingest a real amenity feed (or community-sourced data) this file
// can be replaced with a DB lookup behind the same `getStopAmenities()`
// signature without UI changes.

export type StopAmenities = {
  /** Sheltered structure (roof + walls/sides). Helps in rain. */
  shelter: boolean;
  /** Provides meaningful shade during midday sun. Critical in CY summer. */
  shade: boolean;
  /** Has at least one bench / seat. */
  seating: boolean;
  /** Boarding area is step-free from the sidewalk (no curb obstacle). */
  stepFree: boolean;
};

// Curated seed — Nicosia central hubs + main intercity terminals.
// Conservative: only flags we're confident about based on on-site inventory.
const KNOWN: Record<string, StopAmenities> = {
  // Solomos Square — main urban terminal, fully equipped
  "1009": { shelter: true, shade: true, seating: true, stepFree: true },
  // Eleftherias Square hub
  "1001": { shelter: true, shade: true, seating: true, stepFree: true },
  // Engomi terminal
  "2030": { shelter: true, shade: true, seating: true, stepFree: true },
  // Latsia hub
  "3050": { shelter: true, shade: false, seating: true, stepFree: true },
  // Strovolos hub
  "2050": { shelter: true, shade: false, seating: true, stepFree: true },
  // Intercity — Larnaca airport bay
  "intercity-larnaca-airport": { shelter: true, shade: true, seating: true, stepFree: true },
  // Intercity — Paphos terminal
  "intercity-paphos": { shelter: true, shade: true, seating: true, stepFree: true },
  // Intercity — Limassol Old Port
  "intercity-limassol-oldport": { shelter: true, shade: true, seating: true, stepFree: true },
};

export function getStopAmenities(stopId: string | undefined | null): StopAmenities | undefined {
  if (!stopId) return undefined;
  return KNOWN[stopId];
}

/** Count of amenities we have any data for. Useful for diagnostics + roadmap. */
export function knownAmenityCount(): number {
  return Object.keys(KNOWN).length;
}
