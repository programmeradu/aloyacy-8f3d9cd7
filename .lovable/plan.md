# Quick-Win Moats — Ship Plan

Four shippable-this-week features. All free data. All defensible.

---

## 1. Dust alerts on trip cards

**Why:** `pulse-air.ts` already flags `dustAlert: pm10 ≥ 80` per zone. Currently only visible on `/pulse`. Move it to the surface that matters — the trip itinerary.

**Build:**
- New `getDustAdvisory({ originLat, originLng, destLat, destLng })` server fn in `src/lib/pulse-live.functions.ts` — reads the closest two PULSE_ZONES from `pulse_signals` `key='air'`, returns `{ active, band, pm10, label, advice }` (advice copy varies by walk distance + sensitivity).
- New `<DustAdvisoryBanner>` component (limestone/ochre tokens, no icons beyond bespoke SVG) shown above the itinerary when `active && hasWalkLeg ≥ 200m`. Copy patterns: "Dust front in Limassol — swap the 600 m walk for the 30 bus" / "PM10 110 — covered wait at Solomos suggested".
- Wire into `src/routes/trips.tsx` next to the existing weather chip.

**Moat:** Health-aware routing. Pame/Cyprus Bus don't touch air quality. EU Accessibility Act tailwind.

---

## 2. GBFS aggregator endpoint

**Why:** No competitor publishes a canonical CY micromobility feed. We already have Nextbike (5 cities) + Bolt (Nicosia, 255 zones). Publishing a GBFS-spec endpoint at `/api/public/gbfs.json` makes Aloya the data layer anyone building MaaS in CY has to integrate with.

**Build:**
- `src/routes/api/public/gbfs.json.ts` — GBFS 3.0 auto-discovery file pointing to:
  - `/api/public/gbfs/system_information.json`
  - `/api/public/gbfs/station_information.json` (Nextbike stations)
  - `/api/public/gbfs/station_status.json` (Nextbike live bikes/docks)
  - `/api/public/gbfs/free_bike_status.json` (Bolt zones as virtual stations)
  - `/api/public/gbfs/vehicle_types.json`
- All routes read existing snapshots from `bikeshare.functions.ts` and `bolt-scooter.functions.ts` data sources (no new ingestion).
- CORS open (`*`), 60 s `Cache-Control`. Compliant with [GBFS 3.0 spec](https://github.com/MobilityData/gbfs).
- Linked from `public/llms.txt` + sitemap so MobilityData crawlers find it.

**Moat:** Once registered with MobilityData's GBFS catalog, Aloya becomes the canonical CY operator entry. Trip-planner SDKs (OTP, Transitland) auto-pick it up. Data-layer lock-in.

---

## 3. CyNAP DATEX II traffic fusion

**Why:** `traffic4cyprus.org.cy` publishes free DATEX II v2.3 — roadworks, closures, incidents. Nobody fuses it with bus ETAs.

**Build:**
- New cron route `src/routes/api/public/hooks/pulse-traffic.ts` (15 min interval) — fetches the DATEX II XML feed, parses with `fast-xml-parser` (already in deps? check; if not, `bun add fast-xml-parser`), normalises to `{ id, kind, severity, road, coords, validFrom, validTo, headline }`, upserts into `pulse_signals` `key='traffic'`, scope per island region + `'island'` rollup.
- `getTrafficNearRoute(routeId)` server fn — geometric match: incident within 250 m of any route shape segment → return affected incidents.
- ETA confidence penalty: if active incident on a route shape, downgrade `confidence` band one notch in `eta-v2.ts` (or wherever the confidence label is computed).
- Show `<TrafficIncidentChip>` on affected route cards (`/route/$routeId`) + a new "Traffic" tile on `/pulse`.

**Moat:** Cross-validation. When the GTFS-RT bus is "on time" but a closure is on its path, we know it isn't. First CY app to fuse the two.

---

## 4. Cruise surge banner on /pulse

**Why:** Limassol cruise days = surge demand on routes to Old Port / city centre. DP World publishes 2025-27 schedule as PDF. Static JSON is enough.

**Build:**
- `src/data/cyprus-cruise-schedule.json` — hand-curated from DP World PDF: `[{ date, vessel, line, paxCapacity, berth, etaLocal, etdLocal }]` for next 90 days; refresh quarterly via a one-line update.
- `getCruiseSurge()` server fn in `src/lib/pulse.functions.ts` — returns today's + tomorrow's calls with computed `surgeBand` (low <2k pax, med 2-4k, high >4k).
- New `<CruiseSurgeTile>` on `/pulse` (Limassol scope only) — editorial line ("MSC World Europa in port today — expect heavier loads on 30 / 21 / 25 between 09:00 and 17:00"). No surge claim when `band='low'`.
- Reuses existing PulseLiveSection tile pattern.

**Moat:** Vessel-aware demand prediction. Operational signal Pame doesn't have.

---

## Order of work (one commit per feature)

1. Dust on trips (smallest, immediate user value)
2. Cruise surge tile (static data, fast)
3. GBFS aggregator (data-layer claim)
4. DATEX fusion (biggest, needs cron + ETA changes)

## Technical notes

- All new server routes use the `apikey` header guard pattern (matches existing `pulse-*` hooks).
- pg_cron schedules: traffic every 15 min, no new cron for dust/cruise/GBFS.
- All UI uses limestone/ink/aegean/ochre tokens. Bricolage + Geist. No icons beyond `src/components/Icons.tsx`. No bullet dots. No emojis.
- No new dependencies except `fast-xml-parser` (check first).
- All copy bilingual (en + el dictionaries).

## Out of scope (called out so it's explicit)

- Wheelchair routing (#5) — needs OpenRouteService self-host, separate sprint.
- Limassol parking (#6) — needs municipal partnership.
- BLE beacons / LoRaWAN (#7, #8) — hardware, not this sprint.
- Cruise PDF auto-scrape — manual JSON refresh is fine quarterly; Firecrawl scrape later if it becomes a chore.

After this ships I'll come back with the "bigger moats / path to revenue + recognition" strategy you asked for.
