# Pulse → "Cyprus Today" — full island heartbeat

A daily, context-aware editorial page that fuses what's happening on the roads, in the stadiums, at the ports, and in the air — written for both locals and tourists.

---

## Page structure (top → bottom)

```text
┌─────────────────────────────────────────┐
│ 1. EDITORIAL HERO                       │
│    Bespoke gouache illustration         │
│    Mood word + headline + 1-line lede   │
│    Auto-selected from today's signals   │
├─────────────────────────────────────────┤
│ 2. TODAY ON THE ISLAND (3-up tiles)     │
│    Football · Events · Cruise/Holiday   │
├─────────────────────────────────────────┤
│ 3. ROAD PULSE                           │
│    Reliability arc + ghost              │
│    Hour-by-hour strip                   │
│    Flow river (late/on-time/early)      │
├─────────────────────────────────────────┤
│ 4. HOTSPOTS                             │
│    Traffic corridors + reroutes         │
│    Trending stops (from our data)       │
├─────────────────────────────────────────┤
│ 5. WEATHER & BEACH INDEX                │
│    Today's weather + ride implications  │
├─────────────────────────────────────────┤
│ 6. ROUTES TABLE                         │
│    Ranked dot-strip (current pulse v2)  │
├─────────────────────────────────────────┤
│ 7. EDITORIAL VERDICT                    │
│    1-sentence sign-off + fun fact       │
└─────────────────────────────────────────┘
```

---

## Section 1 — Editorial hero (the soul of the page)

A `composeTodayHeadline` server fn ranks signals by "interestingness" and picks ONE lead story. Examples by theme:

| Theme            | Trigger                                  | Headline pattern                                                                 |
|------------------|------------------------------------------|----------------------------------------------------------------------------------|
| `derby`          | APOEL/Omonia/AEL fixture today           | "Derby night in Nicosia. Expect GSP traffic from 17:30."                         |
| `heatwave`       | Forecast >35°C                           | "Hot one today — 37°C in Nicosia. Buses running with AC on max."                 |
| `cruise`         | Cruise ship docked Limassol              | "Two cruise ships in Limassol port. Old town buses busier than usual."           |
| `festival`       | Major event (Pafos Aphrodite, Kourion)   | "Aphrodite Festival opens tonight at Paphos Castle."                             |
| `holiday`        | Public holiday or major name day         | "Kataklysmos today — coastal routes packed, inland calm."                        |
| `storm`          | Rain/storm forecast                      | "Wet morning rolling in from the west. Troodos road slick after 11:00."          |
| `calm`           | None of the above                        | "A quiet Wednesday. Roads moving, skies clear, no fixtures."                     |

Each theme has its own gouache illustration (generated once, reused per theme). Selected at server-render time.

---

## Data sources & server fns

| New server fn                  | Source                                            | Cache    |
|--------------------------------|---------------------------------------------------|----------|
| `getCyprusFixtures`            | CFA + scraped fixture pages via Firecrawl         | 6h       |
| `getCyprusEvents`              | visitcyprus.com + Pafos/Limassol municipalities   | 12h      |
| `getCruiseSchedule`            | Limassol Port public schedule (scraped)           | 24h      |
| `getTrafficHotspots`           | Google Routes API on 6 known corridors            | 5m       |
| `getTrendingStops`             | Our own analytics (most-viewed stops 24h)         | 30m      |
| `getBeachIndex`                | Weather + UV + wind, computed                     | 1h       |
| `getDailyFact`                 | Curated JSON (60 facts, rotated by day-of-year)   | static   |
| `composeTodayHeadline`         | Composes all of the above into 1 lead + theme key | 10m      |

All read-only, public, no auth. Firecrawl already available as a connector — will use for fixture/event/cruise scraping.

---

## Illustrations (imagegen, generated once)

Bespoke gouache scenes in our Mediterranean palette (ochre / aegean / olive / limestone). 8 hero scenes + 6 small theme glyphs:

**Hero scenes (1600×900):** derby-night, heatwave-coast, cruise-port, festival-castle, holiday-village, storm-troodos, calm-day, snow-troodos.

**Small theme glyphs (400×400):** football, ship, festival-mask, sun, rain-cloud, calendar.

---

## Curated content (no API needed)

- `src/data/cyprus-facts.json` — 60 fun facts (local-leaning + tourist-leaning, tagged).
- `src/data/cyprus-name-days.json` — Major Orthodox name days mapped to dates.
- `src/data/cyprus-corridors.json` — 6 traffic corridors with start/end coords for Routes API.

---

## i18n

All editorial templates parameterized (route ID, venue, temperature, etc.) and translated en/el. Greek translations are first-class — Cypriot context matters.

---

## Implementation order

1. **Foundation** — server fns + curated JSON + Firecrawl wiring.
2. **Hero illustrations** — generate 8 gouache scenes via imagegen.
3. **`composeTodayHeadline`** — the ranking + theme selection brain.
4. **UI** — rebuild `pulse.tsx` top-to-bottom following the structure above.
5. **Verify** — mobile viewport, both locales, all 8 themes by mocking signals.

---

## What stays from current Pulse

- Reliability arc + ghost, hour strip, flow river, dot-strip — all keepers, moved into the **Road Pulse** section as part of the larger story.
- All existing server fns (`getPulse`, `getLivePulse`, `getPulseHourStrip`) untouched.

---

## What I need from you

Approval to build. This is ~1 long session of work: scraping wiring, ~8 illustration generations, ~5 new server fns, full page rebuild, i18n. I'll verify each theme renders before handing back.