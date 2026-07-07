// Live signal cards — met warnings, news rotator, sea, sky, cruises, air
// quality and football fixtures. Presentational only.

import { useEffect, useState } from "react";
import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { relativeAgo } from "./shared";
import pulseNewsImg from "@/assets/pulse-news-kafenion.jpg";
import pulseSeaImg from "@/assets/pulse-sea-card.jpg";
import pulseSkyImg from "@/assets/pulse-sky-card.jpg";
import pulseCruiseImg from "@/assets/pulse-cruise-card.jpg";

/* ────────────── Met warnings — only render when active ─────────────── */

export function MetWarningCard({
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
    ? w.level === "red"
      ? "Κόκκινη"
      : w.level === "orange"
        ? "Πορτοκαλί"
        : "Κίτρινη"
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

export function NewsRotatorCard({
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
          <span
            className="mx-2 inline-block h-1.5 w-px translate-y-[1px] bg-line align-middle"
            aria-hidden
          />
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

export function SeaCard({
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
    if (isEl)
      return v === "great"
        ? "Ιδανική"
        : v === "good"
          ? "Καλή"
          : v === "choppy"
            ? "Ταραγμένη"
            : "Άγρια";
    return v === "great"
      ? "Excellent"
      : v === "good"
        ? "Good"
        : v === "choppy"
          ? "Choppy"
          : "Rough";
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
          {isEl ? "Θάλασσα · " : "Sea · "}
          {city}
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`font-display text-[26px] leading-none tracking-[-0.02em] ${verdictTone}`}
          >
            {verdictLabel}
          </span>
          {payload.waveHeightM != null && (
            <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
              · {payload.waveHeightM.toFixed(1)}m
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink-soft text-pretty">{payload.summary}</p>
        {payload.seaTempC != null && (
          <p className="mt-2 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
            {isEl ? "θερμοκρασία νερού " : "water "}
            {Math.round(payload.seaTempC)}°
          </p>
        )}
      </div>
    </article>
  );
}

/* ────────────── Sky — combined airport movements ───────────────────── */

export function SkyCard({
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
          {isEl ? "Ουρανός · " : "Sky · "}
          {cities}
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

export function CruiseCard({
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

export function AirCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["air"]>;
  city: string;
  isEl: boolean;
}) {
  const tone = payload.band === "very-poor" || payload.band === "poor" ? "text-ochre" : "text-ink";
  const bandLabel = (() => {
    if (isEl) {
      switch (payload.band) {
        case "good":
          return "Καλή";
        case "fair":
          return "Μέτρια";
        case "moderate":
          return "Αυξημένη";
        case "poor":
          return "Κακή";
        case "very-poor":
          return "Πολύ κακή";
        default:
          return "—";
      }
    }
    switch (payload.band) {
      case "good":
        return "Good";
      case "fair":
        return "Fair";
      case "moderate":
        return "Moderate";
      case "poor":
        return "Poor";
      case "very-poor":
        return "Very poor";
      default:
        return "—";
    }
  })();
  return (
    <article className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line px-5 py-5">
      <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
        {isEl ? "Αέρας · " : "Air · "}
        {city}
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
      <p className="mt-2 text-[13px] leading-snug text-ink-soft text-pretty">{payload.summary}</p>
      {payload.dustAlert && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-ochre/10 ring-1 ring-ochre/30 px-3 py-1 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ochre">
          {isEl ? "Σκόνη από τη Σαχάρα" : "Saharan dust"}
        </p>
      )}
    </article>
  );
}
