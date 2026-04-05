// Pulse — live signals section
// Renders every fresh `pulse_signals` row the API gives us, gracefully omitting
// any signal that's missing. Tiles are zone-aware: the sea card only appears
// for coastal zones, cruises only when there's a ship calling at Limassol, etc.
//
// Editorial rules (project memory):
// - Bricolage Grotesque display, Geist sans body. No thin weights.
// - No emoji, no decorative bullets, no generic Lucide icons.
// - Painterly assets, generous negative space, large numerals.

import { useEffect, useMemo, useState } from "react";
import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { PULSE_ZONES, type PulseZone } from "@/lib/pulse-zones";
import pulseNewsImg from "@/assets/pulse-news-kafenion.jpg";
import pulseSeaImg from "@/assets/pulse-sea-card.jpg";
import pulseSkyImg from "@/assets/pulse-sky-card.jpg";
import pulseCruiseImg from "@/assets/pulse-cruise-card.jpg";
import pulseTrafficImg from "@/assets/pulse-traffic-card.jpg";
import pulseTrafficRoadworksImg from "@/assets/pulse-traffic-roadworks.jpg";
import pulseTrafficClosureImg from "@/assets/pulse-traffic-closure.jpg";
import pulseTrafficCongestionImg from "@/assets/pulse-traffic-congestion.jpg";

type Locale = "en" | "el";

export function PulseLiveSection({
  bundle,
  locale,
}: {
  bundle: PulseLiveBundle;
  locale: Locale;
}) {
  const isEl = locale === "el";
  const focusLabel = isEl ? bundle.focus.labelEl : bundle.focus.label;

  // Decide what to render — nothing if absolutely no signals are fresh.
  const hasAny =
    bundle.news ||
    bundle.marine ||
    bundle.air ||
    bundle.metWarnings?.count ||
    bundle.cruises?.count ||
    bundle.flights.length > 0 ||
    bundle.events?.count ||
    bundle.fixtures?.count ||
    bundle.traffic?.count;

  if (!hasAny) return null;

  return (
    <section className="px-6 mt-10 animate-rise" style={{ animationDelay: "200ms" }}>

      {bundle.metWarnings && bundle.metWarnings.count > 0 && (
        <MetWarningCard payload={bundle.metWarnings} isEl={isEl} />
      )}

      {bundle.news && bundle.news.count > 0 && (
        <NewsRotatorCard payload={bundle.news} isEl={isEl} />
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {bundle.marine && bundle.focus.coastal && (
          <SeaCard payload={bundle.marine} city={focusLabel} isEl={isEl} />
        )}
        {bundle.flights.length > 0 && (
          <SkyCard payloads={bundle.flights} isEl={isEl} />
        )}
        {bundle.cruises && bundle.cruises.count > 0 && (
          <CruiseCard payload={bundle.cruises} isEl={isEl} />
        )}
        {bundle.air && shouldShowAir(bundle.air) && (
          <AirCard payload={bundle.air} city={focusLabel} isEl={isEl} />
        )}
      </div>

      {bundle.traffic && bundle.traffic.count > 0 && (
        <TrafficCard payload={bundle.traffic} city={focusLabel} isEl={isEl} />
      )}


      {bundle.fixtures && bundle.fixtures.count > 0 && (
        <FixturesStrip payload={bundle.fixtures} isEl={isEl} />
      )}

      {bundle.events && bundle.events.count > 0 && (
        <EventsStrip payload={bundle.events} isEl={isEl} />
      )}
    </section>
  );
}

/* ────────────── Met warnings — only render when active ─────────────── */

function MetWarningCard({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["metWarnings"]>;
  isEl: boolean;
}) {
  const w = payload.warnings[0];
  if (!w) return null;
  const accent =
    w.level === "red"
      ? "bg-ochre/15 ring-ochre/40 text-ochre"
      : w.level === "orange"
      ? "bg-ochre/10 ring-ochre/30 text-ochre"
      : "bg-aegean-deep/8 ring-aegean-deep/25 text-aegean-deep";
  const levelLabel = isEl
    ? w.level === "red" ? "Κόκκινη" : w.level === "orange" ? "Πορτοκαλί" : "Κίτρινη"
    : w.level;
  return (
    <article className={`relative overflow-hidden rounded-[22px] ring-1 px-5 py-4 mb-4 ${accent}`}>
      <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.24em] mb-1.5">
        {(isEl ? "Προειδοποίηση Καιρού · " : "Weather warning · ") + levelLabel}
      </p>
      <h3 className="font-display text-[17px] leading-tight text-ink text-balance">
        {w.summary || `${w.kind} — ${w.area}`}
      </h3>
      {payload.count > 1 && (
        <p className="mt-2 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
          +{payload.count - 1} {isEl ? "ακόμη ενεργές" : "more active"}
        </p>
      )}
    </article>
  );
}

/* ────────────── News rotator — auto-cycles fresh headlines ─────────── */

function NewsRotatorCard({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["news"]>;
  isEl: boolean;
}) {
  const items = payload.items.slice(0, 8);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(id);
  }, [items.length]);

  const cur = items[idx] ?? items[0];
  if (!cur) return null;
  const ago = relativeAgo(cur.publishedAt, isEl);

  return (
    <article className="relative overflow-hidden rounded-[28px] bg-card ring-1 ring-line">
      <div className="relative aspect-[16/8] w-full overflow-hidden">
        <img
          src={pulseNewsImg}
          alt=""
          aria-hidden
          loading="lazy"
          width={1600}
          height={896}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 35%, transparent) 55%, var(--color-card) 100%)",
          }}
        />
        <div className="absolute left-5 top-5">
          <p className="inline-flex items-center gap-2 rounded-full bg-card/90 backdrop-blur-sm px-3 py-1 font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink ring-1 ring-line">
            {isEl ? "Από το νησί" : "On the island"}
          </p>
        </div>
      </div>

      <a
        href={cur.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block px-6 pt-3 pb-5 group"
      >
        <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ochre">
          {cur.source}
          <span className="mx-2 inline-block h-1.5 w-px translate-y-[1px] bg-line align-middle" aria-hidden />
          {ago}
        </p>
        <h3 className="mt-1.5 font-display text-[20px] leading-[1.15] text-ink text-balance break-soft group-hover:underline underline-offset-4 decoration-ochre/60">
          {cur.title}
        </h3>

        {items.length > 1 && (
          <div className="mt-4 flex items-center gap-1.5" aria-hidden>
            {items.map((_, i) => (
              <span
                key={i}
                className={`h-[3px] rounded-full transition-all ${
                  i === idx ? "w-6 bg-ink" : "w-3 bg-line"
                }`}
              />
            ))}
          </div>
        )}
      </a>
    </article>
  );
}

/* ────────────── Sea / beach — coastal zones only ───────────────────── */

function SeaCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["marine"]>;
  city: string;
  isEl: boolean;
}) {
  const verdictLabel = (() => {
    const v = payload.beachVerdict;
    if (!v) return isEl ? "Θάλασσα" : "At sea";
    if (isEl) return v === "great" ? "Ιδανική" : v === "good" ? "Καλή" : v === "choppy" ? "Ταραγμένη" : "Άγρια";
    return v === "great" ? "Excellent" : v === "good" ? "Good" : v === "choppy" ? "Choppy" : "Rough";
  })();
  const verdictTone =
    payload.beachVerdict === "great" || payload.beachVerdict === "good"
      ? "text-aegean-deep"
      : "text-ochre";

  return (
    <article className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line">
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <img
          src={pulseSeaImg}
          alt=""
          aria-hidden
          loading="lazy"
          width={1600}
          height={896}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 45%, transparent) 60%, var(--color-card) 100%)",
          }}
        />
      </div>
      <div className="relative px-5 pt-3 pb-5">
        <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
          {isEl ? "Θάλασσα · " : "Sea · "}{city}
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`font-display text-[26px] leading-none tracking-[-0.02em] ${verdictTone}`}>
            {verdictLabel}
          </span>
          {payload.waveHeightM != null && (
            <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
              · {payload.waveHeightM.toFixed(1)}m
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink-soft text-pretty">
          {payload.summary}
        </p>
        {payload.seaTempC != null && (
          <p className="mt-2 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
            {isEl ? "θερμοκρασία νερού " : "water "}{Math.round(payload.seaTempC)}°
          </p>
        )}
      </div>
    </article>
  );
}

/* ────────────── Sky — combined airport movements ───────────────────── */

function SkyCard({
  payloads,
  isEl,
}: {
  payloads: PulseLiveBundle["flights"];
  isEl: boolean;
}) {
  const arr = payloads.reduce((s, p) => s + p.arrivalsNext60, 0);
  const dep = payloads.reduce((s, p) => s + p.departuresNext60, 0);
  const cities = payloads.map((p) => p.city).join(" + ");

  return (
    <article className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line">
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <img
          src={pulseSkyImg}
          alt=""
          aria-hidden
          loading="lazy"
          width={1600}
          height={896}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 40%, transparent) 60%, var(--color-card) 100%)",
          }}
        />
      </div>
      <div className="relative px-5 pt-3 pb-5">
        <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
          {isEl ? "Ουρανός · " : "Sky · "}{cities}
        </p>
        <div className="mt-1 flex items-end gap-5">
          <div>
            <div className="font-display text-[30px] leading-none text-ink tabular-nums tracking-[-0.02em]">
              {arr}
            </div>
            <p className="mt-1 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft">
              {isEl ? "Αφίξεις / ώρα" : "Arrivals / 1h"}
            </p>
          </div>
          <div>
            <div className="font-display text-[30px] leading-none text-ochre tabular-nums tracking-[-0.02em]">
              {dep}
            </div>
            <p className="mt-1 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft">
              {isEl ? "Αναχωρήσεις / ώρα" : "Departures / 1h"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-snug text-ink-soft text-pretty">
          {arr + dep === 0
            ? isEl
              ? "Ήρεμη επόμενη ώρα στους ουρανούς."
              : "Quiet skies in the next hour."
            : isEl
            ? "Επόμενη ώρα — επιπλέον αιτήματα ταξί και Bus 425 / Express."
            : "Expect extra demand on airport shuttles and taxi ranks."}
        </p>
      </div>
    </article>
  );
}

/* ────────────── Cruises — Limassol port calls today ────────────────── */

function CruiseCard({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["cruises"]>;
  isEl: boolean;
}) {
  const next = payload.ships[0];
  return (
    <article className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line sm:col-span-2">
      <div className="relative aspect-[21/9] w-full overflow-hidden">
        <img
          src={pulseCruiseImg}
          alt=""
          aria-hidden
          loading="lazy"
          width={1600}
          height={896}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 40%, transparent) 60%, var(--color-card) 100%)",
          }}
        />
      </div>
      <div className="relative px-6 pt-3 pb-5">
        <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ochre">
          {isEl ? "Λιμάνι Λεμεσού · σήμερα" : "Limassol port · today"}
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="font-display text-[34px] leading-none text-ink tabular-nums tracking-[-0.02em]">
            {payload.count}
          </span>
          <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {payload.count === 1 ? (isEl ? "πλοίο" : "ship") : isEl ? "πλοία" : "ships"}
          </span>
          {payload.totalPassengers > 0 && (
            <span className="ml-auto font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
              ~{payload.totalPassengers.toLocaleString()} {isEl ? "επιβάτες" : "guests"}
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink-soft text-pretty">
          {payload.summary ||
            (next
              ? isEl
                ? `Επόμενο — ${next.shipName}${next.arrival ? ` στις ${next.arrival}` : ""}.`
                : `Next — ${next.shipName}${next.arrival ? ` arriving ${next.arrival}` : ""}.`
              : "")}
        </p>
        {payload.totalPassengers >= 2000 && (
          <p
            className="mt-2 font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ochre"
            role="status"
          >
            {payload.totalPassengers >= 4000
              ? isEl
                ? "Υψηλή κίνηση — αναμένετε γεμάτα δρομολόγια προς το παλιό λιμάνι και το κέντρο"
                : "High surge — expect packed runs to Old Port and city centre"
              : isEl
                ? "Μέτρια κίνηση — δρομολόγια προς λιμάνι ίσως είναι γεμάτα"
                : "Moderate surge — port-bound runs may be busy"}
          </p>
        )}
        {payload.ships.length > 1 && (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {payload.ships.slice(0, 4).map((s, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 border-t border-line/70 pt-1.5"
              >
                <span className="font-sans font-semibold text-[13px] text-ink truncate">
                  {s.shipName}
                </span>
                <span className="font-eyebrow text-[9.5px] uppercase tracking-[0.18em] text-ink-soft tabular-nums whitespace-nowrap">
                  {s.arrival ?? "—"}
                  {s.departure ? ` › ${s.departure}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/* ────────────── Air quality — only when notable ───────────────────── */

function shouldShowAir(p: NonNullable<PulseLiveBundle["air"]>): boolean {
  if (p.dustAlert) return true;
  return p.band === "moderate" || p.band === "poor" || p.band === "very-poor";
}

function AirCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["air"]>;
  city: string;
  isEl: boolean;
}) {
  const tone =
    payload.band === "very-poor" || payload.band === "poor"
      ? "text-ochre"
      : "text-ink";
  const bandLabel = (() => {
    if (isEl) {
      switch (payload.band) {
        case "good": return "Καλή";
        case "fair": return "Μέτρια";
        case "moderate": return "Αυξημένη";
        case "poor": return "Κακή";
        case "very-poor": return "Πολύ κακή";
        default: return "—";
      }
    }
    switch (payload.band) {
      case "good": return "Good";
      case "fair": return "Fair";
      case "moderate": return "Moderate";
      case "poor": return "Poor";
      case "very-poor": return "Very poor";
      default: return "—";
    }
  })();
  return (
    <article className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line px-5 py-5">
      <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
        {isEl ? "Αέρας · " : "Air · "}{city}
      </p>
      <div className="mt-1 flex items-baseline gap-3">
        <span className={`font-display text-[28px] leading-none tracking-[-0.02em] ${tone}`}>
          {bandLabel}
        </span>
        {payload.europeanAqi != null && (
          <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
            AQI {Math.round(payload.europeanAqi)}
          </span>
        )}
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink-soft text-pretty">
        {payload.summary}
      </p>
      {payload.dustAlert && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-ochre/10 ring-1 ring-ochre/30 px-3 py-1 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ochre">
          {isEl ? "Σκόνη από τη Σαχάρα" : "Saharan dust"}
        </p>
      )}
    </article>
  );
}

/* ────────────── Football fixtures strip ────────────────────────────── */

function FixturesStrip({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["fixtures"]>;
  isEl: boolean;
}) {
  const next = payload.fixtures.slice(0, 3);
  if (next.length === 0) return null;
  return (
    <section className="mt-6">
      <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink-soft mb-2">
        {isEl ? "Επόμενοι αγώνες — Α' Κατηγορία" : "Next up — Cyprus First Division"}
      </p>
      <ul className="grid gap-2">
        {next.map((f, i) => {
          const k = f.kickoff ? new Date(f.kickoff) : null;
          const when = k
            ? `${k.toLocaleDateString(isEl ? "el-GR" : "en-GB", { weekday: "short", day: "numeric", month: "short" })}  ${k.toLocaleTimeString(isEl ? "el-GR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`
            : isEl ? "ώρα ΤBA" : "time TBA";
          return (
            <li
              key={i}
              className="rounded-[18px] bg-card ring-1 ring-line px-4 py-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-sans font-semibold text-[14px] text-ink truncate">
                  {f.home} <span className="text-ink-soft font-medium">vs</span> {f.away}
                </p>
                {(f.venue || f.city) && (
                  <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.18em] text-ink-soft truncate">
                    {[f.venue, f.city].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.18em] text-ochre tabular-nums whitespace-nowrap">
                {when}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ────────────── Events strip ───────────────────────────────────────── */

function EventsStrip({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["events"]>;
  isEl: boolean;
}) {
  const now = Date.now();
  const upcoming = useMemo(
    () =>
      payload.events
        .filter((e) => !e.startDate || Date.parse(e.startDate) >= now - 24 * 3600 * 1000)
        .slice(0, 4),
    [payload.events, now],
  );
  if (upcoming.length === 0) return null;
  return (
    <section className="mt-6">
      <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink-soft mb-2">
        {isEl ? "Στο νησί αυτές τις μέρες" : "Around the island this week"}
      </p>
      <ul className="grid gap-2">
        {upcoming.map((e, i) => {
          const d = e.startDate ? new Date(e.startDate) : null;
          const when = d
            ? d.toLocaleDateString(isEl ? "el-GR" : "en-GB", { day: "numeric", month: "short" })
            : isEl ? "συνεχίζεται" : "ongoing";
          return (
            <li
              key={i}
              className="rounded-[18px] bg-card ring-1 ring-line px-4 py-3 flex items-baseline gap-3"
            >
              <span className="font-display text-[15px] leading-tight text-ink text-balance flex-1 min-w-0 break-soft">
                {e.title}
              </span>
              <span className="font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-aegean-deep tabular-nums whitespace-nowrap">
                {when}
                {e.city ? ` · ${e.city}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ────────────── Helpers ────────────────────────────────────────────── */

function relativeAgo(iso: string, isEl: boolean): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  const min = Math.max(1, Math.round(diff / 60_000));
  if (min < 60) return isEl ? `πριν ${min} λ.` : `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return isEl ? `πριν ${h} ώ.` : `${h}h ago`;
  const d = Math.round(h / 24);
  return isEl ? `πριν ${d} ημ.` : `${d}d ago`;
}

/* ────────────── Traffic — CyNAP DATEX II live incidents ─────────────── */

type TrafficKind = NonNullable<PulseLiveBundle["traffic"]>["incidents"][number]["kind"];

const GREEK_RE = /[\u0370-\u03FF\u1F00-\u1FFF]/;
/** Cyprus motorway/primary codes (A1–A9, B1–B23, F1xx, E1xx) — universal in both locales. */
const ROAD_CODE_RE = /\b([ABEF]\d{1,3})\b/;

const PLACE_TRANSLITERATIONS: Record<string, { en: string; el: string }> = {
  "λεμεσού":   { en: "Limassol", el: "Λεμεσού" },
  "λεμεσος":   { en: "Limassol", el: "Λεμεσός" },
  "λευκωσίας": { en: "Nicosia",  el: "Λευκωσίας" },
  "λευκωσία":  { en: "Nicosia",  el: "Λευκωσία" },
  "λάρνακας":  { en: "Larnaca",  el: "Λάρνακας" },
  "λάρνακα":   { en: "Larnaca",  el: "Λάρνακα" },
  "πάφου":     { en: "Paphos",   el: "Πάφου" },
  "πάφος":     { en: "Paphos",   el: "Πάφος" },
  "αμμοχώστου":{ en: "Famagusta",el: "Αμμοχώστου" },
  "παραλιμνίου":{en: "Paralimni",el: "Παραλιμνίου" },
};

/** Tidy a raw road string from DATEX — strip prefixes, collapse whitespace. */
function tidyRoad(road: string | null): string | null {
  if (!road) return null;
  const t = road
    .replace(/^(Οδός|Λεωφόρος|Λεωφ\.?|Road|Street|Avenue|Ave\.?|Highway|Hwy\.?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 0 ? t : null;
}

function zoneLabel(zoneId: string | null, isEl: boolean): string | null {
  if (!zoneId) return null;
  const z = PULSE_ZONES.find((p) => p.id === (zoneId as PulseZone));
  if (!z) return null;
  return isEl ? z.labelEl : z.label;
}

/**
 * Build a locale-correct location phrase from raw road + zone.
 * Returns an object so callers can decide between "on the A1" vs "near Nicosia".
 */
function localizedPlace(
  road: string | null,
  zoneId: string | null,
  fallbackCity: string,
  isEl: boolean,
): { kind: "road" | "near"; label: string } {
  const tidy = tidyRoad(road);

  // 1. Cyprus road codes (A1, B8, etc.) — universal, locale-agnostic.
  const code = tidy?.match(ROAD_CODE_RE)?.[1];
  if (code) return { kind: "road", label: code };

  // 2. Tidy road string, but only if it matches the active locale's script.
  if (tidy) {
    const hasGreek = GREEK_RE.test(tidy);
    if (isEl && hasGreek) return { kind: "road", label: tidy };
    if (!isEl && !hasGreek) return { kind: "road", label: tidy };
    // 2b. Token-level transliteration for common place names.
    const tokens = tidy.toLowerCase().split(/\s+/);
    const mapped = tokens
      .map((tok) => PLACE_TRANSLITERATIONS[tok]?.[isEl ? "el" : "en"])
      .filter(Boolean) as string[];
    if (mapped.length > 0) return { kind: "near", label: mapped[0] };
  }

  // 3. Fall back to the incident's nearest editorial zone.
  const z = zoneLabel(zoneId, isEl);
  if (z) return { kind: "near", label: z };

  // 4. Last resort — the focus city the card is already showing.
  return { kind: "near", label: fallbackCity };
}

/** Friendly rider-facing one-liner derived from kind + locale-aware place. */
function friendlyTrafficHeadline(
  kind: TrafficKind,
  road: string | null,
  zoneId: string | null,
  city: string,
  isEl: boolean,
): string {
  const p = localizedPlace(road, zoneId, city, isEl);
  const where = isEl
    ? p.kind === "road" ? `στον ${p.label}` : `κοντά στη ${p.label}`
    : p.kind === "road" ? `on the ${p.label}` : `near ${p.label}`;

  if (isEl) {
    switch (kind) {
      case "roadworks":   return `Έργα οδοποιίας ${where}`;
      case "closure":     return `Κλειστός δρόμος ${where}`;
      case "accident":    return `Ατύχημα ${where}`;
      case "congestion":  return `Πυκνή κίνηση ${where}`;
      case "weather":     return `Καιρικό συμβάν ${where}`;
      default:            return `Συμβάν ${where}`;
    }
  }
  switch (kind) {
    case "roadworks":   return `Roadworks ${where}`;
    case "closure":     return `Road closed ${where}`;
    case "accident":    return `Crash reported ${where}`;
    case "congestion":  return `Heavy traffic ${where}`;
    case "weather":     return `Weather-related delay ${where}`;
    default:            return `Incident ${where}`;
  }
}

/** Generic feed strings we should NOT surface — fall back to synthesized copy. */
const GENERIC_HEADLINE_RE = /^(traffic event reported|incident|συμβάν|γεγονός)\.?$/i;

/** Structured DATEX rows like "City:Strovolos, Street:Agias Marinas, Category:ROAD_CLOSED.NO_SUBTYPE". */
const STRUCTURED_RE = /city\s*:\s*([^,\n]+).*?street\s*:\s*([^,\n]+).*?category\s*:\s*([A-Za-z0-9_.-]+)/i;

const CITY_TRANSLIT: Record<string, { en: string; el: string }> = {
  "lefkosia":   { en: "Nicosia",   el: "Λευκωσία" },
  "nicosia":    { en: "Nicosia",   el: "Λευκωσία" },
  "strovolos":  { en: "Strovolos", el: "Στρόβολος" },
  "lemesos":    { en: "Limassol",  el: "Λεμεσός" },
  "limassol":   { en: "Limassol",  el: "Λεμεσός" },
  "larnaka":    { en: "Larnaca",   el: "Λάρνακα" },
  "larnaca":    { en: "Larnaca",   el: "Λάρνακα" },
  "pafos":      { en: "Paphos",    el: "Πάφος" },
  "paphos":     { en: "Paphos",    el: "Πάφος" },
  "ammochostos":{ en: "Famagusta", el: "Αμμόχωστος" },
  "famagusta":  { en: "Famagusta", el: "Αμμόχωστος" },
  "paralimni":  { en: "Paralimni", el: "Παραλίμνι" },
  "aglantzia":  { en: "Aglantzia", el: "Αγλαντζιά" },
  "lakatamia":  { en: "Lakatamia", el: "Λακατάμια" },
  "engomi":     { en: "Engomi",    el: "Έγκωμη" },
};

function localizeCity(raw: string, isEl: boolean): string {
  const hit = CITY_TRANSLIT[raw.trim().toLowerCase()];
  if (hit) return isEl ? hit.el : hit.en;
  return raw.trim();
}

function categoryToKind(cat: string): TrafficKind {
  const c = cat.toUpperCase();
  if (c.includes("ROADWORK") || c.includes("CONSTRUCTION") || c.includes("MAINTENANCE")) return "roadworks";
  if (c.includes("ROAD_CLOSED") || c.includes("CLOSURE") || c.includes("BLOCKED")) return "closure";
  if (c.includes("ACCIDENT") || c.includes("CRASH")) return "accident";
  if (c.includes("CONGESTION") || c.includes("JAM") || c.includes("HEAVY")) return "congestion";
  if (c.includes("WEATHER") || c.includes("RAIN") || c.includes("FOG") || c.includes("SNOW") || c.includes("WIND")) return "weather";
  return "other";
}

/** Parse a structured "City:..., Street:..., Category:..." row → friendly copy. */
function parseStructured(
  headline: string | null,
  isEl: boolean,
): { headline: string; line: string; kind: TrafficKind } | null {
  if (!headline) return null;
  const m = headline.match(STRUCTURED_RE);
  if (!m) return null;
  const cityRaw = m[1].trim();
  const street = m[2].trim();
  const kind = categoryToKind(m[3]);
  const city = localizeCity(cityRaw, isEl);
  const where = isEl ? `στην ${street}, ${city}` : `on ${street}, ${city}`;
  const head = isEl
    ? (kind === "roadworks" ? `Έργα οδοποιίας ${where}`
      : kind === "closure"   ? `Κλειστός δρόμος ${where}`
      : kind === "accident"  ? `Ατύχημα ${where}`
      : kind === "congestion"? `Πυκνή κίνηση ${where}`
      : kind === "weather"   ? `Καιρικό συμβάν ${where}`
      :                        `Συμβάν ${where}`)
    : (kind === "roadworks" ? `Roadworks ${where}`
      : kind === "closure"   ? `Road closed ${where}`
      : kind === "accident"  ? `Crash ${where}`
      : kind === "congestion"? `Heavy traffic ${where}`
      : kind === "weather"   ? `Weather delay ${where}`
      :                        `Incident ${where}`);
  const kShort = isEl
    ? (kind === "roadworks" ? "Έργα" : kind === "closure" ? "Κλειστός" : kind === "accident" ? "Ατύχημα" : kind === "congestion" ? "Κίνηση" : kind === "weather" ? "Καιρός" : "Συμβάν")
    : (kind === "roadworks" ? "Roadworks" : kind === "closure" ? "Closed" : kind === "accident" ? "Crash" : kind === "congestion" ? "Heavy traffic" : kind === "weather" ? "Weather" : "Incident");
  return { headline: head, line: `${kShort} · ${street}, ${city}`, kind };
}

/**
 * If the DATEX feed gave us a specific description that matches the active
 * locale's script, prefer it over the synthesized one-liner. Returns null
 * when the feed text is empty, generic, structured, or in the wrong script.
 */
function specificFromFeed(headline: string | null, isEl: boolean): string | null {
  if (!headline) return null;
  const t = headline.trim().replace(/\s+/g, " ");
  if (t.length < 12) return null;
  if (GENERIC_HEADLINE_RE.test(t)) return null;
  // Never surface structured key:value rows — they're machine data, not copy.
  if (STRUCTURED_RE.test(t)) return null;
  if (/\b(city|street|category)\s*:/i.test(t)) return null;
  const hasGreek = GREEK_RE.test(t);
  const hasCode = ROAD_CODE_RE.test(t);
  if (isEl && !hasGreek && !hasCode) return null;
  if (!isEl && hasGreek && !hasCode) return null;
  return t.length > 160 ? t.slice(0, 157).trimEnd() + "…" : t;
}

/** Tiny secondary-line summary: "{kind} · {locale-aware place}". */
function friendlyTrafficLine(
  kind: TrafficKind,
  road: string | null,
  zoneId: string | null,
  city: string,
  isEl: boolean,
): string {
  const p = localizedPlace(road, zoneId, city, isEl);
  if (isEl) {
    const k = kind === "roadworks" ? "Έργα" : kind === "closure" ? "Κλειστός" : kind === "accident" ? "Ατύχημα" : kind === "congestion" ? "Κίνηση" : kind === "weather" ? "Καιρός" : "Συμβάν";
    return `${k} · ${p.label}`;
  }
  const k = kind === "roadworks" ? "Roadworks" : kind === "closure" ? "Closed" : kind === "accident" ? "Crash" : kind === "congestion" ? "Heavy traffic" : kind === "weather" ? "Weather" : "Incident";
  return `${k} · ${p.label}`;
}


/** Pick an editorial illustration that matches the dominant kind in view. */
function pickTrafficImage(kind: TrafficKind): string {
  switch (kind) {
    case "roadworks":  return pulseTrafficRoadworksImg;
    case "closure":    return pulseTrafficClosureImg;
    case "congestion": return pulseTrafficCongestionImg;
    case "accident":
    case "weather":
    default:           return pulseTrafficImg;
  }
}

function TrafficCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["traffic"]>;
  city: string;
  isEl: boolean;
}) {
  const top = payload.incidents[0];
  if (!top) return null;

  const severityTone =
    payload.highest === "high"
      ? "text-ochre"
      : payload.highest === "medium"
        ? "text-aegean-deep"
        : "text-olive";

  const severityLabel = isEl
    ? payload.highest === "high" ? "Σοβαρό" : payload.highest === "medium" ? "Μέτριο" : "Ήπιο"
    : payload.highest === "high" ? "Severe" : payload.highest === "medium" ? "Notable" : "Minor";

  const heroHeadline =
    specificFromFeed(top.headline, isEl) ??
    friendlyTrafficHeadline(top.kind, top.road, top.zone, city, isEl);
  const heroImg = pickTrafficImage(top.kind);
  const rest = payload.incidents.slice(1, 4);

  return (
    <article className="relative mt-3 overflow-hidden rounded-[24px] bg-card ring-1 ring-line">
      <div className="relative aspect-[21/9] w-full overflow-hidden">
        <img
          src={heroImg}
          alt=""
          aria-hidden
          loading="lazy"
          width={1600}
          height={896}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 40%, transparent) 60%, var(--color-card) 100%)",
          }}
        />
      </div>
      <div className="relative px-6 pt-3 pb-5">
        <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ochre">
          {(isEl ? "Κυκλοφορία · " : "Traffic · ") + city}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[34px] leading-none text-ink tabular-nums tracking-[-0.02em]">
            {payload.count}
          </span>
          <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {payload.count === 1
              ? (isEl ? "ενεργό συμβάν" : "live incident")
              : (isEl ? "ενεργά συμβάντα" : "live incidents")}
          </span>
          <span className={`ml-auto font-eyebrow text-[9.5px] uppercase tracking-[0.22em] tabular-nums ${severityTone}`}>
            {severityLabel}
          </span>
        </div>

        <div className="mt-3 border-t border-line/60 pt-3">
          <h3 className="font-display text-[18px] leading-tight text-ink text-balance">
            {heroHeadline}
          </h3>
        </div>

        {rest.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {rest.map((inc) => (
              <li key={inc.id} className="text-[12.5px] leading-snug text-ink-soft text-pretty">
                {specificFromFeed(inc.headline, isEl) ??
                  friendlyTrafficLine(inc.kind, inc.road, inc.zone, city, isEl)}
              </li>
            ))}
          </ul>
        )}

        {payload.count > rest.length + 1 && (
          <p className="mt-3 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
            +{payload.count - rest.length - 1} {isEl ? "ακόμη ενεργά" : "more active"}
          </p>
        )}
      </div>
    </article>
  );
}


