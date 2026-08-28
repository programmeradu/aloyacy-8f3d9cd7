// English source of truth. Add a key here first, then translate in the matching el/ file.
// Coach / city-bus / taxi lines must match packages/core/src/airport-job.ts.

export const airport = {
  "airport.kicker": "Airport {code}",
  "airport.howToLeave": "How to leave",
  "airport.coach": "Coach to {city} at {depart} — {detail}.",
  "airport.cityBus": "Bus {route} in {min} min. Tap Motion {fare}.",
  "airport.cityBusNow": "Bus {route} now. Tap Motion {fare}.",
  "airport.taxi": "Taxi rank outside arrivals. We don't quote a fare we haven't measured.",
} as const;
