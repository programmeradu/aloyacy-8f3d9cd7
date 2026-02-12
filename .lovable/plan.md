## Why this needs a rebuild, not a polish

The current page asks riders to stare at absolute numbers (`56/100`, `42%`, `+0 min`) without telling them what those numbers *mean for their day*. Leading rider-facing pulse pages (TfL Go, Transit App, MBTA, TransitPulse AU, Citymapper) all share one move: they replace raw values with **contextual comparisons**, **confidence signals**, and **scoped relevance**. That's the gap.

Plan below is grounded in research on those products plus the data fields we already have (`onTimePct`, `meanDelaySec`, `sampleCount`, `routesTracked`, `latePct/onTimePct/earlyPct`, `medianDelaySec`, `observations`).

---

## The new Pulse page — section by section

### 1. Weather-report headline (replaces the dial as the lead)
Editorial verdict instead of a number-first hero.

> **"Mostly smooth across Cyprus today."**
> *Network is running 74% on time — 6 points better than this week's average. Route 30 is the rough spot.*

Composition: oversized display sentence, mood word (`Smooth` / `Choppy` / `Rough` / `Storming`) in aegean italic, supporting one-liner in ink-soft. Reads like a Bloomberg/FT lede, not a metric.

### 2. Reliability arc — but with a "typical" ghost
Keep the arc, but layer a **muted baseline arc** showing the historical typical OTP. The gap between baseline and today's fill is the story. Add a delta chip: `+6 vs typical` (olive) or `-9 vs typical` (ochre). No more naked 56/100.

### 3. Bespoke hero illustration (new asset)
Generate a **mediterranean isometric scene**: ochre buses tracing across a stylized Cyprus coastline at the hour-of-day matching the rider's current time (dawn / midday / dusk / night) — picked at render via simple time gate. Hand-painted gouache style consistent with brand. Four scenes total (one per phase). Sits behind the headline as a quiet anchor, not screaming for attention.

### 4. Network Flow ribbon — upgraded to a "river"
Replace the flat segmented bar with an **SVG flow ribbon**: three streams (late / on-time / early) that widen and narrow horizontally based on share, with a subtle animated current. Median drift annotation hangs off the on-time stream. Feels alive, not a progress bar.

### 5. "Today vs typical" hour-strip (new — uses live + historical)
24-cell horizontal strip showing **how the network felt each hour today** (color = mean delay per hour). At the current hour, a vertical "you are here" marker. Cells before are filled; cells after are ghosted. Single most-actionable view: *"the morning was rough, it's clearing up now."*

### 6. Route ranking — single dot-strip, not three lists
Collapse the three list-cards into **one ranked dot-strip**:
- X axis = mean delay (early ← 0 → late), zero line in the middle.
- Each route = a labeled dot. Color encodes late/on-time/early. **Dot size encodes sample count** (confidence). Tap → route page.
- Top filter chips: `All • Late • Early • Steadiest • Near me`.
This visualization, with size-as-confidence, is the single most insightful thing we can build from our data: riders see at a glance which routes are trustworthy AND outliers, not just sorted lists.

### 7. "So what" insight chips (new server fn additions)
Two to three rotating chips above the route ranking, computed server-side from existing data:
- *"3 routes near you are running 4+ min late right now"* (uses geolocation + live)
- *"Route 230 is steadier before 09:15"* (hour-of-day bucketed mean delay)
- *"Network is calmer than usual for a Wednesday"* (day-of-week historical compare)
These are the editorial layer that turns data into a decision.

### 8. Confidence footnote everywhere
Every metric gets a quiet `· based on N live observations` micro-label. Removes the "where did this come from?" doubt.

### 9. Route portraits (illustration system)
Each route in the ranking gets a **tiny 28×28 line-art icon** representing its character (coast / mountain / city / village) instead of just a colored chip. Generated once as a sprite. Makes the list feel like meeting characters, not reading a spreadsheet.

---

## Technical notes

- **New server fn**: `getPulseInsights` — returns 2-3 ranked insight chips from existing `delay_stats` (hour-of-day buckets) + live snapshot. Pure read, no schema changes.
- **New server fn**: `getPulseHourStrip` — returns 24 hourly mean-delay buckets for today's network. Aggregates `rt_snapshots` by `extract(hour from captured_at)`. Cacheable 5 min.
- **New assets** (imagegen):
  - 4× hero scenes (dawn/midday/dusk/night Cyprus + buses), gouache style
  - 1× sprite or 6× route portrait illustrations (coast/mountain/city/village/intercity/airport)
- **New components**: `WeatherHeadline`, `ReliabilityArcWithGhost`, `FlowRiver` (SVG), `HourStrip`, `RouteDotStrip`, `InsightChip`, `RoutePortrait`.
- **Removed**: `Section` × 3 (replaced by single `RouteDotStrip` with filter chips), the flat segmented `NetworkFlow` (replaced by `FlowRiver`).
- **i18n**: all new strings added to `en.ts` + `el.ts` in same change. Mood words ("Smooth", "Choppy", "Rough", "Storming") carefully localized.
- **Typography**: stays Bricolage + Geist + JetBrains Mono. No new fonts. `font-eyebrow` retained.
- **Color**: stays within existing limestone / aegean / ochre / olive / ink tokens. No new tokens needed.

---

## What it feels like after

The page reads top-to-bottom as: **mood → today vs typical → why → what to do**. A rider can answer "should I leave now?" in under 4 seconds without parsing a single percentage. That's the bar.

---

## What I need from you

Just an approval to build. I'll generate the illustrations, write the server fns, build the components, wire i18n, and verify on mobile viewport before handing back.