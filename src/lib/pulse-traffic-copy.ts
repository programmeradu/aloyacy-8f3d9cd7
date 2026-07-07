// Traffic copy normalisation — turns raw CyNAP DATEX II incident text into
// plain, localized language a rider can act on. Pure string/geo logic, no
// React, so it can be unit-tested without rendering the Pulse page.

import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { PULSE_ZONES, type PulseZone } from "@/lib/pulse-zones";

export type TrafficKind = NonNullable<PulseLiveBundle["traffic"]>["incidents"][number]["kind"];

const GREEK_RE = /[\u0370-\u03FF\u1F00-\u1FFF]/;
/** Cyprus motorway/primary codes (A1–A9, B1–B23, F1xx, E1xx) — universal in both locales. */
const ROAD_CODE_RE = /\b([ABEF]\d{1,3})\b/;

const PLACE_TRANSLITERATIONS: Record<string, { en: string; el: string }> = {
  λεμεσού: { en: "Limassol", el: "Λεμεσού" },
  λεμεσος: { en: "Limassol", el: "Λεμεσός" },
  λευκωσίας: { en: "Nicosia", el: "Λευκωσίας" },
  λευκωσία: { en: "Nicosia", el: "Λευκωσία" },
  λάρνακας: { en: "Larnaca", el: "Λάρνακας" },
  λάρνακα: { en: "Larnaca", el: "Λάρνακα" },
  πάφου: { en: "Paphos", el: "Πάφου" },
  πάφος: { en: "Paphos", el: "Πάφος" },
  αμμοχώστου: { en: "Famagusta", el: "Αμμοχώστου" },
  παραλιμνίου: { en: "Paralimni", el: "Παραλιμνίου" },
};

/** Tidy a raw road string from DATEX — strip prefixes, collapse whitespace. */
export function tidyRoad(road: string | null): string | null {
  if (!road) return null;
  const t = road
    .replace(/^(Οδός|Λεωφόρος|Λεωφ\.?|Road|Street|Avenue|Ave\.?|Highway|Hwy\.?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 0 ? t : null;
}

export function zoneLabel(zoneId: string | null, isEl: boolean): string | null {
  if (!zoneId) return null;
  const z = PULSE_ZONES.find((p) => p.id === (zoneId as PulseZone));
  if (!z) return null;
  return isEl ? z.labelEl : z.label;
}

/**
 * Build a locale-correct location phrase from raw road + zone.
 * Returns an object so callers can decide between "on the A1" vs "near Nicosia".
 */
export function localizedPlace(
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
export function friendlyTrafficHeadline(
  kind: TrafficKind,
  road: string | null,
  zoneId: string | null,
  city: string,
  isEl: boolean,
): string {
  const p = localizedPlace(road, zoneId, city, isEl);
  const where = isEl
    ? p.kind === "road"
      ? `στον ${p.label}`
      : `κοντά στη ${p.label}`
    : p.kind === "road"
      ? `on the ${p.label}`
      : `near ${p.label}`;

  if (isEl) {
    switch (kind) {
      case "roadworks":
        return `Έργα οδοποιίας ${where}`;
      case "closure":
        return `Κλειστός δρόμος ${where}`;
      case "accident":
        return `Ατύχημα ${where}`;
      case "congestion":
        return `Πυκνή κίνηση ${where}`;
      case "weather":
        return `Καιρικό συμβάν ${where}`;
      default:
        return `Συμβάν ${where}`;
    }
  }
  switch (kind) {
    case "roadworks":
      return `Roadworks ${where}`;
    case "closure":
      return `Road closed ${where}`;
    case "accident":
      return `Crash reported ${where}`;
    case "congestion":
      return `Heavy traffic ${where}`;
    case "weather":
      return `Weather-related delay ${where}`;
    default:
      return `Incident ${where}`;
  }
}

/** Generic feed strings we should NOT surface — fall back to synthesized copy. */
const GENERIC_HEADLINE_RE = /^(traffic event reported|incident|συμβάν|γεγονός)\.?$/i;

/** Structured DATEX rows like "City:Strovolos, Street:Agias Marinas, Category:ROAD_CLOSED.NO_SUBTYPE". */
const STRUCTURED_RE =
  /city\s*:\s*([^,\n]+).*?street\s*:\s*([^,\n]+).*?category\s*:\s*([A-Za-z0-9_.-]+)/i;

const CITY_TRANSLIT: Record<string, { en: string; el: string }> = {
  lefkosia: { en: "Nicosia", el: "Λευκωσία" },
  nicosia: { en: "Nicosia", el: "Λευκωσία" },
  strovolos: { en: "Strovolos", el: "Στρόβολος" },
  lemesos: { en: "Limassol", el: "Λεμεσός" },
  limassol: { en: "Limassol", el: "Λεμεσός" },
  larnaka: { en: "Larnaca", el: "Λάρνακα" },
  larnaca: { en: "Larnaca", el: "Λάρνακα" },
  pafos: { en: "Paphos", el: "Πάφος" },
  paphos: { en: "Paphos", el: "Πάφος" },
  ammochostos: { en: "Famagusta", el: "Αμμόχωστος" },
  famagusta: { en: "Famagusta", el: "Αμμόχωστος" },
  paralimni: { en: "Paralimni", el: "Παραλίμνι" },
  aglantzia: { en: "Aglantzia", el: "Αγλαντζιά" },
  lakatamia: { en: "Lakatamia", el: "Λακατάμια" },
  engomi: { en: "Engomi", el: "Έγκωμη" },
};

export function localizeCity(raw: string, isEl: boolean): string {
  const hit = CITY_TRANSLIT[raw.trim().toLowerCase()];
  if (hit) return isEl ? hit.el : hit.en;
  return raw.trim();
}

export function categoryToKind(cat: string): TrafficKind {
  const c = cat.toUpperCase();
  if (c.includes("ROADWORK") || c.includes("CONSTRUCTION") || c.includes("MAINTENANCE"))
    return "roadworks";
  if (c.includes("ROAD_CLOSED") || c.includes("CLOSURE") || c.includes("BLOCKED")) return "closure";
  if (c.includes("ACCIDENT") || c.includes("CRASH")) return "accident";
  if (c.includes("CONGESTION") || c.includes("JAM") || c.includes("HEAVY")) return "congestion";
  if (
    c.includes("WEATHER") ||
    c.includes("RAIN") ||
    c.includes("FOG") ||
    c.includes("SNOW") ||
    c.includes("WIND")
  )
    return "weather";
  return "other";
}

/** Parse a structured "City:..., Street:..., Category:..." row → friendly copy. */
export function parseStructured(
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
    ? kind === "roadworks"
      ? `Έργα οδοποιίας ${where}`
      : kind === "closure"
        ? `Κλειστός δρόμος ${where}`
        : kind === "accident"
          ? `Ατύχημα ${where}`
          : kind === "congestion"
            ? `Πυκνή κίνηση ${where}`
            : kind === "weather"
              ? `Καιρικό συμβάν ${where}`
              : `Συμβάν ${where}`
    : kind === "roadworks"
      ? `Roadworks ${where}`
      : kind === "closure"
        ? `Road closed ${where}`
        : kind === "accident"
          ? `Crash ${where}`
          : kind === "congestion"
            ? `Heavy traffic ${where}`
            : kind === "weather"
              ? `Weather delay ${where}`
              : `Incident ${where}`;
  const kShort = isEl
    ? kind === "roadworks"
      ? "Έργα"
      : kind === "closure"
        ? "Κλειστός"
        : kind === "accident"
          ? "Ατύχημα"
          : kind === "congestion"
            ? "Κίνηση"
            : kind === "weather"
              ? "Καιρός"
              : "Συμβάν"
    : kind === "roadworks"
      ? "Roadworks"
      : kind === "closure"
        ? "Closed"
        : kind === "accident"
          ? "Crash"
          : kind === "congestion"
            ? "Heavy traffic"
            : kind === "weather"
              ? "Weather"
              : "Incident";
  return { headline: head, line: `${kShort} · ${street}, ${city}`, kind };
}

/**
 * If the DATEX feed gave us a specific description that matches the active
 * locale's script, prefer it over the synthesized one-liner. Returns null
 * when the feed text is empty, generic, structured, or in the wrong script.
 */
export function specificFromFeed(headline: string | null, isEl: boolean): string | null {
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
export function friendlyTrafficLine(
  kind: TrafficKind,
  road: string | null,
  zoneId: string | null,
  city: string,
  isEl: boolean,
): string {
  const p = localizedPlace(road, zoneId, city, isEl);
  if (isEl) {
    const k =
      kind === "roadworks"
        ? "Έργα"
        : kind === "closure"
          ? "Κλειστός"
          : kind === "accident"
            ? "Ατύχημα"
            : kind === "congestion"
              ? "Κίνηση"
              : kind === "weather"
                ? "Καιρός"
                : "Συμβάν";
    return `${k} · ${p.label}`;
  }
  const k =
    kind === "roadworks"
      ? "Roadworks"
      : kind === "closure"
        ? "Closed"
        : kind === "accident"
          ? "Crash"
          : kind === "congestion"
            ? "Heavy traffic"
            : kind === "weather"
              ? "Weather"
              : "Incident";
  return `${k} · ${p.label}`;
}
