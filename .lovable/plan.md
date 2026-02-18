
# Pulse — Live, Smart, Aware

Goal: turn the Pulse page from compositional heuristics + static JSON into a fully **dynamic, location-aware, real-time, culturally-tuned** briefing for each rider, anywhere on the island, at any moment of their journey.

Three signal axes drive every card:
- **WHERE** — user GPS, active trip origin/destination, town/coast/mountain zone.
- **WHEN** — local Cyprus time, day of week, season, daylight phase, public holiday calendar.
- **WHAT'S HAPPENING** — weather, sea, traffic, transit, sport, culture, ports, civic events, air quality.

Below: the full data stack we will wire, organised by source, with caching, refresh cadence, and which Pulse card each one feeds.

---

## 1. Data sources — full inventory

### A. Already wired (keep, deepen)
| Source | What we get | Where it goes |
|---|---|---|
| GTFS-RT (Motionbuses) | Live vehicle positions, trip updates | Road Pulse, ETA, trip vibe |
| `rt_snapshots` table | Historical samples for delay/OTP medians | Activity comb, Network OTP %, anomaly detection |
| Static GTFS JSON | Routes, stops, shapes | Map, route lookups |
| Google Routes / Directions | Authoritative driving baseline | Delta vs scheduled, trip ETA, traffic state |
| Google Places (Maps Platform connector) | Place names, categories at destination | "On the island right now" destination context |
| Browser geolocation | Rider lat/lng | Zone routing, nearby content |

### B. New — Environment & weather
| Source | Cadence | Purpose |
|---|---|---|
| **Open-Meteo** (free, no key) — current + hourly + 7-day for Nicosia, Limassol, Larnaca, Paphos, Troodos, Ayia Napa | 15 min | Temp, feels-like, UV, wind, precip, cloud — drives weather tile, heatwave/storm theme, bus-stop wait advice |
| **Open-Meteo Marine API** (Larnaca, Limassol, Paphos, Ayia Napa, Polis buoys) | 30 min | Wave height, swell, sea-surface temp — drives "beach day" tile, coastal trip cards |
| **Open-Meteo Air Quality API** | 1 h | PM2.5, ozone, **Saharan dust (PM10 spikes)** — extremely Cyprus-relevant; flips theme to "dusty" and recommends covered waits |
| **Cyprus Met Service (cymet.gov.cy)** — yellow/orange/red warnings | scrape, 30 min | Official storm/heat/dust warnings, formal alert chip |
| **OpenUV** *(if key, optional)* | 1 h | Burn-time advisory in summer |

### C. New — Transport context (beyond our own buses)
| Source | Cadence | Purpose |
|---|---|---|
| **Hermes Airport (LCA, PFO) flight boards** — scrape `hermesairports.com` arrivals/departures | 5 min | "Larnaca arrivals next 30 min: 12" → drives airport-route demand, late-night bus relevance |
| **Limassol & Paphos Port — CruiseMapper / cruisemapper.com/ports/limassol** | scrape 1×/day at 04:00 | Real cruise calls today, ship names, passenger counts — replaces the current heuristic `cruiseInPort()` |
| **Marine Traffic API** *(optional, has free tier)* | 30 min | Cargo + tanker movements off Limassol — niche, only if user is near port |
| **TomTom / HERE Traffic Flow API** *(optional, low-volume)* | 5 min | Motorway A1/A6 jams, incident overlays for intercity trip cards |
| **Google Roads + Routes** (already have key) | per request | Live drive-time deltas for the current intercity trip |

### D. New — Culture, sport, civic
| Source | Cadence | Purpose |
|---|---|---|
| **Cyprus Football Association fixtures** — scrape `cfa.com.cy` / Wikipedia season pages | daily 03:00 | Replaces hardcoded derby list with the real fixture (incl. cup ties, European nights) |
| **APOEL / Omonoia / AEL / Apollon / Anorthosis official sites** | weekly | Match-day road closures, stadium shuttle hints |
| **Visit Cyprus / Deputy Ministry of Tourism events feed** — scrape `visitcyprus.com/events` | daily 03:00 | Festivals, concerts, wine fests, Limassol Carnival, Kataklysmos, Anthestiria |
| **municipality.gov.cy event calendars** (Nicosia, Limassol, Larnaca, Paphos) | daily 03:00 | Civic events, road closures, parades |
| **Bank of Cyprus / public holidays API** (or a hand-curated JSON we maintain) | static + yearly refresh | Public holidays drive the "holiday" theme and bus schedule warnings |
| **Cyprus Orthodox Church name-day calendar** (already in JSON) | static | Name-day tile — keep but cross-check against church feed |
| **Cyprus News scrape** (Cyprus Mail, in-cyprus, philenews) — only headlines, only when scope matches transit/civic disruption | 30 min | Last-resort "alert" tile (e.g. strike, march, closure) |

### E. New — Tourism & destination intel (when an active trip is long-distance)
| Source | Cadence | Purpose |
|---|---|---|
| **Google Places — `nearbySearch`** at trip destination | per trip | What's open near where you're going: tavernas, museums, beach bars |
| **Wikivoyage / Wikipedia city section** (scrape, summarise via Lovable AI) | weekly per city | "About Paphos right now: harbour castle, Tombs of the Kings, sunset at Coral Bay" — true editorial intel |
| **TripAdvisor "things to do" top 5** (scrape, polite) | weekly | Backup discovery |

### F. New — Rider-sourced (our differentiation)
| Source | Cadence | Purpose |
|---|---|---|
| `rider_vehicle_fixes` table | live | Crowd-corrected positions feed Road Pulse confidence |
| New `pulse_reports` table (we'll build) | live | "Bus is packed", "AC broken", "Driver friendly" — small structured pings, surfaced anonymously |
| `commute_patterns` | nightly | Personalises "your usual 8:12 to Larnaca is running tight today" |

---

## 2. Architecture — how it fuses

```text
                ┌─────────────────────────────────────────────┐
                │  CRON (pg_cron)                             │
                │  every 1m  → snapshot ingest                │
                │  every 5m  → flights, traffic               │
                │  every 15m → weather, air, marine           │
                │  every 30m │ news, met warnings, port live  │
                │  daily 03h │ fixtures, cruises, events,     │
                │            │ holidays, city summaries       │
                └────┬────────────────────────────────────────┘
                     ▼
              ┌───────────────────┐         ┌────────────────────┐
              │ pulse_signals     │◀────────│ /api/public/hooks/ │
              │ (cache table,     │  upsert │   <feed-name>      │
              │  key, payload,    │         │ verifies x-cron    │
              │  scope, ttl)      │         │ pulls + normalises │
              └─────────┬─────────┘         └────────────────────┘
                        │
                        ▼
              createServerFn  getPulseBriefing({ lat, lng, tripId, locale })
                        │
                        ├── resolves zone (coast / city / mountain / airport / port)
                        ├── reads pulse_signals where scope intersects zone
                        ├── joins with active trip destination → destination intel
                        ├── runs theme arbitration (storm > dust > heatwave > derby > festival > cruise > calm)
                        ├── ranks tiles by relevance score (location × time × novelty)
                        └── returns typed PulseBriefing DTO (12-tile max)
                        │
                        ▼
              React Query (staleTime 60s) → Pulse cards
```

All scrapers and external fetches run in **server functions or `/api/public/hooks/*` routes** — never from the browser. Cached in a single `pulse_signals` table so the page render reads one row set, no fan-out fetches.

---

## 3. Per-card wiring

| Pulse card | Live inputs | Refresh | Fallback |
|---|---|---|---|
| **Today headline + theme** | weather + warnings + fixtures + cruises + holidays → arbitration | 15 min | "Calm island day" |
| **Hero illustration** | `theme` → one of 7 bespoke gouache assets | static | `calm` |
| **Weather tile** | Open-Meteo current + warning chip | 15 min | Last cached |
| **Sea & beaches tile** *(coastal users only)* | Marine API + UV | 30 min | Hidden |
| **Air & dust tile** *(only when triggered)* | Air Quality API | 1 h | Hidden |
| **Today in sport** | CFA fixtures | daily | Hidden if none |
| **Festivals & events** | visitcyprus + municipality scrapes | daily | Hidden |
| **Ports today** | CruiseMapper scrape | daily | Hidden if none |
| **Airport pulse** *(only when near LCA/PFO or trip is airport route)* | Hermes scrape | 5 min | Hidden |
| **Road Pulse (network card)** | `rt_snapshots` last hour + GTFS-RT live | 1 min | Empty-state copy |
| **Trip-aware destination card** *(only when long-distance trip active)* | Google Places + Wikivoyage summary at destination | per trip | "Arriving in Paphos" |
| **Name day** | static JSON | daily | — |
| **Fun fact** | static JSON, rotates | daily | — |

---

## 4. Smart behaviour rules

1. **Zone routing** — derive `zone` from rider GPS: `nicosia | larnaca | limassol | paphos | famagusta | troodos | airport-lca | airport-pfo | port-limassol | coast | inland`. Tiles filter by zone; mountain user never sees beach card.
2. **Trip override** — if `useActiveTrip()` has an intercity destination, **destination zone wins** over rider zone for half the tiles; rider keeps weather + air + own departure.
3. **Time-of-day biasing** — morning: commute & weather. Midday: beach/dust/UV. Evening: events, fixtures, dinner spots. Night: late buses, airport arrivals.
4. **Theme arbitration order** — `storm > dust > heatwave > derby > festival > cruise > holiday > calm`. Hero asset and accent colour both pivot on the winner.
5. **Anomaly surfacing** — when `rt_snapshots` shows OTP drop >25% vs 30-day median for a corridor the user has saved, push a one-line alert tile to the top.
6. **Editorial summarisation** — long scraped text (event description, city intel) is shrunk by Lovable AI Gateway to a 90-char editorial line at write time, not at render — keeps SSR fast and cost predictable.
7. **Honesty** — every tile carries a `source` string in its DTO; we render a quiet attribution rail (e.g. "Open-Meteo · CFA · CruiseMapper") at the bottom of the page.

---

## 5. Infrastructure to build

- `pulse_signals` table: `(key text PK, scope text, payload jsonb, source text, fetched_at, ttl_seconds)` + GRANTs + RLS (public read of non-sensitive scope).
- Server routes under `/api/public/hooks/`:
  `weather`, `marine`, `air`, `met-warnings`, `flights`, `cruises`, `traffic`, `fixtures`, `events`, `news`, `city-intel`. Each guarded by `apikey` (anon JWT) header.
- pg_cron schedules wired exactly to the cadences above.
- One `getPulseBriefing` server fn that owns the fusion + arbitration logic; the route is thin.
- Firecrawl connector (already available) used for the scrapers that have no API.

---

## 6. Build order (proposed)

1. `pulse_signals` table + cron skeleton + one feed (weather) end-to-end as the reference pattern.
2. Marine + Air Quality + Met Warnings → completes the **environment** axis.
3. CruiseMapper + Hermes flights → completes the **transit context** axis.
4. CFA fixtures + visitcyprus events → completes the **culture** axis.
5. Destination intel (Places + Wikivoyage) → trip-aware mode.
6. Theme arbitration + zone routing rewrite of `getTodayBriefing` → unified `getPulseBriefing`.
7. Editorial polish: bespoke gouache assets per *new* tile type, attribution rail, anomaly tile.

Each step lands behind the existing page, swapping one card at a time — Pulse stays shippable throughout.

---

## 7. Open questions for you

- **CruiseMapper / Marine Traffic / TomTom** all have free tiers but rate limits. Confirm we go scraper-first (Firecrawl) and only add paid APIs if the scrape gets blocked.
- **News tile** — do you want it at all, or is it noise? Default: off, on only when an item directly affects transit.
- **Personalisation depth** — should saved places + commute patterns influence Pulse tiles from day one, or after we stabilise the public signals?
- **Editorial AI summaries** — Lovable AI Gateway (free tier) or paid model for the city-intel summariser?

Pick the answers and I'll start with step 1 (signals table + weather feed) as the reference implementation.
