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
import pulseNewsImg from "@/assets/pulse-news-kafenion.jpg";
import pulseSeaImg from "@/assets/pulse-sea-card.jpg";
import pulseSkyImg from "@/assets/pulse-sky-card.jpg";
import pulseCruiseImg from "@/assets/pulse-cruise-card.jpg";

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
    bundle.fixtures?.count;

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
