// Wave 2.3 — curated Park & Ride hub inventory for the Nicosia catchment.
//
// These are real parking locations within 2-8 km of Nicosia centre where:
//   1. A rider arriving by car can reliably find a free / cheap parking spot.
//   2. A frequent urban bus stop sits within a short walk of the lot.
//
// We deliberately keep this list small and high-confidence. Every entry was
// chosen because the parking AND the inbound bus link are both robust.
// Unknown hubs are simply absent — Aloya never bluffs.
//
// Add new hubs only after on-site verification (parking is real, free or
// signposted; nearest stop has at least one route running >= every 30 min
// during peak). When operator-published P&R data lands, this file can be
// replaced behind the same shape with no UI changes.

import type { CityId } from "@/lib/cities";

export type ParkAndRideHub = {
  id: string;
  /** Internal slug, also used as React key. */
  name: string;
  /** Display label (EN). EL copy is resolved via i18n at render time. */
  label: string;
  /** Optional short note: capacity, cost, gotchas. Surfaced in the card. */
  note?: string;
  /** City this hub serves. Suggester only considers hubs whose city matches
   *  the rider's nearest city, so a Nicosia rider never gets a Limassol hub. */
  city: CityId;
  lat: number;
  lng: number;
};

export const PARK_AND_RIDE_HUBS: ParkAndRideHub[] = [
  {
    id: "gsp-stadium",
    name: "gsp-stadium",
    label: "GSP Stadium",
    note: "Large free surface lots, easy in-and-out.",
    lat: 35.1665,
    lng: 33.3168,
  },
  {
    id: "engomi-ucy",
    name: "engomi-ucy",
    label: "Engomi / UCY ring",
    note: "Free street parking around the campus ring.",
    lat: 35.1497,
    lng: 33.3201,
  },
  {
    id: "strovolos-hall",
    name: "strovolos-hall",
    label: "Strovolos Municipal Hall",
    note: "Free municipal lots, frequent inbound buses.",
    lat: 35.1431,
    lng: 33.3463,
  },
  {
    id: "mall-of-cyprus",
    name: "mall-of-cyprus",
    label: "Mall of Cyprus",
    note: "Covered free parking, intercity + urban links.",
    lat: 35.1170,
    lng: 33.3560,
  },
  {
    id: "lakatamia-hub",
    name: "lakatamia-hub",
    label: "Lakatamia transport hub",
    note: "Park-and-ride friendly, southern catchment.",
    lat: 35.1100,
    lng: 33.3290,
  },
];

export function findHub(id: string): ParkAndRideHub | undefined {
  return PARK_AND_RIDE_HUBS.find((h) => h.id === id);
}
