// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { airport as airportEn } from "../en/airport";

export const airport: Record<keyof typeof airportEn, string> = {
  "airport.kicker": "Αεροδρόμιο {code}",
  "airport.howToLeave": "Πώς φεύγετε",
  "airport.howToLeaveTo": "Πώς φεύγετε για {dest}",
  "airport.coach": "Υπεραστικό προς {city} στις {depart} — {detail}.",
  "airport.coachDoor": "Υπεραστικό προς {city} στις {depart} — {fare}, {wait} λεπ. αναμονή, {walk} λεπ. περπάτημα.",
  "airport.coachDoorNoWalk": "Υπεραστικό προς {city} στις {depart} — {fare}, {wait} λεπ. αναμονή.",
  "airport.cityBus": "Λεωφορείο {route} σε {min} λεπ. Motion {fare}.",
  "airport.cityBusNow": "Λεωφορείο {route} τώρα. Motion {fare}.",
  "airport.cityBusDoor": "Λεωφορείο {route}: {fare}, {wait} λεπ. αναμονή, {walk} λεπ. περπάτημα ως {dest}.",
  "airport.taxi": "Πιάτσα ταξί έξω από τις αφίξεις. Δεν αναφέρουμε ναύλο που δεν έχουμε μετρήσει.",
};
