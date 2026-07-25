// Share-card decisions that have nothing to do with canvas: which backdrop a
// stop or destination earns, how times and durations read in each locale, and
// how a headline wraps to a fixed width.
//
// These used to sit inside `src/lib/shareCard.ts` next to the drawing code,
// which made them impossible to test without a DOM. Text measurement is
// injected, so wrapping is verifiable with a plain function.

/** Backdrop identities. The renderer maps these to bundled artwork. */
export type BackdropKey =
  "oldtown" | "coastDusk" | "mountain" | "coastRoad" | "harborNight" | "urbanMorning";

/** FNV-1a — stable across runs so a stop always gets the same backdrop. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MOUNTAIN = /(troodos|kakopetria|platres|pano |kalopanay|pedoulas|prodromos|omodos)/;
const COAST_DUSK = /(phinikoud|finikoud|larnaca seafront|seafront|promenade|marina)/;
const HARBOR = /(pafos|paphos|harbor|harbour|kato pafos|kato paphos|coral bay)/;
const COAST_ROAD =
  /(limassol|lemesos|protaras|ayia napa|agia napa|paralimni|coral|coast|beach|akamas|polis)/;
const OLD_TOWN = /(faneromen|ledra|laiki geitonia|old town|chrysaliniotissa|tahtakala)/;

/** Backdrop for a stop card. Context beats randomness; the hash is the tiebreak. */
export function pickStopBackdrop(stop: { id: string; name: string; agency: string }): BackdropKey {
  const n = stop.name.toLowerCase();
  if (MOUNTAIN.test(n)) return "mountain";
  if (COAST_DUSK.test(n)) return "coastDusk";
  if (HARBOR.test(n)) return "harborNight";
  if (COAST_ROAD.test(n)) return "coastRoad";
  if (OLD_TOWN.test(n)) return "oldtown";
  // Intercity stops are almost always on the coastal corridor.
  if (stop.agency === "IC") return "coastRoad";
  const order: BackdropKey[] = ["urbanMorning", "oldtown", "urbanMorning", "oldtown"];
  return order[hashString(stop.id) % order.length];
}

const PLAN_MOUNTAIN = /(troodos|kakopetria|platres|kalopanay|pedoulas|prodromos|omodos)/;
const PLAN_COAST_DUSK = /(phinikoud|finikoud|seafront|promenade|marina|larnaca)/;
const PLAN_HARBOR = /(pafos|paphos|harbor|harbour|coral bay)/;
const PLAN_COAST_ROAD =
  /(limassol|lemesos|protaras|ayia napa|agia napa|paralimni|coast|beach|akamas|polis)/;
const PLAN_OLD_TOWN = /(nicosia|lefkosia|ledra|faneromen|old town)/;

/** Backdrop for a plan card — keyed on where the rider is heading. */
export function pickPlanBackdrop(destination: string): BackdropKey {
  const n = destination.toLowerCase();
  if (PLAN_MOUNTAIN.test(n)) return "mountain";
  if (PLAN_COAST_DUSK.test(n)) return "coastDusk";
  if (PLAN_HARBOR.test(n)) return "harborNight";
  if (PLAN_COAST_ROAD.test(n)) return "coastRoad";
  if (PLAN_OLD_TOWN.test(n)) return "oldtown";
  const order: BackdropKey[] = ["coastRoad", "oldtown", "urbanMorning", "coastDusk"];
  return order[hashString(destination) % order.length];
}

export type ShareLocale = "en" | "el";

const tag = (locale: ShareLocale) => (locale === "el" ? "el-GR" : "en-GB");

/** 24-hour clock, always in Cyprus time so a rider abroad shares local times. */
export function formatShareTime(unix: number, locale: ShareLocale): string {
  return new Date(unix * 1000).toLocaleTimeString(tag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Nicosia",
  });
}

/** Short uppercase day stamp, e.g. "SAT 22 AUG". */
export function formatShareDay(unix: number, locale: ShareLocale): string {
  return new Date(unix * 1000)
    .toLocaleDateString(tag(locale), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Nicosia",
    })
    .toUpperCase();
}

/** Compact duration: minutes under an hour, then "1h 20m" (Greek: "1ώ 20λ"). */
export function formatShareDuration(sec: number, locale: ShareLocale): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return locale === "el" ? `${m} λεπτά` : `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hLbl = locale === "el" ? "ώ" : "h";
  const mLbl = locale === "el" ? "λ" : "m";
  return r ? `${h}${hLbl} ${r}${mLbl}` : `${h}${hLbl}`;
}

/** Width of a string in the target font; the renderer passes canvas measuring. */
export type MeasureText = (text: string) => number;

/**
 * Greedy word wrap to `maxLines`, ellipsizing the final line when it still
 * overflows. Never returns an empty trailing line.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: MeasureText,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (measure(next) <= maxWidth) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);

  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    if (measure(last) > maxWidth) {
      while (last.length > 1 && measure(last + "…") > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last.trimEnd() + "…";
    }
  }
  return lines;
}
