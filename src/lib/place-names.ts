// Readable place names from the GTFS feed. The feed cuts trip headsigns at
// 17 characters ("University of Cyp") and route long names at 55 ("... - Nor"),
// so names are completed from known stop names, or cut back to a whole word
// with an ellipsis when nothing matches. Separators read as commas on screen
// ("Ave. Stasinou, Arch. Makariou B Square"), never as dashes.

/** The feed's hard cap on trip headsigns. */
export const HEADSIGN_CAP = 17;
/** The feed's hard cap on route long names. */
export const LONG_NAME_CAP = 55;

const SEP = /\s+[-\u2013\u2014]\s+/g;

/** "A - B" reads as "A, B"; collapses double spaces. */
export function displayPlace(name: string): string {
  return name
    .replace(/\s*\u00b4/g, "")
    .replace(SEP, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function trimTail(s: string): string {
  return s.replace(/[\s,\-\u2013\u2014.]+$/, "");
}

/** Cut a truncated name back to its last whole word and mark it with an ellipsis. */
export function wordCut(cut: string): string {
  const t = trimTail(cut);
  const i = t.lastIndexOf(" ");
  if (i <= 0) return t;
  return `${trimTail(t.slice(0, i))}\u2026`;
}

/**
 * Complete a name the feed cut off, from the names that start with it.
 * One match: that name. Several: their shared start, trimmed to whole words
 * ("University of Cyp" -> "University of Cyprus"). None: null.
 */
export function completeCut(cut: string, names: readonly string[]): string | null {
  const c = cut.trim();
  if (!c) return null;
  const lower = c.toLowerCase();
  const hits: string[] = [];
  for (const n of names) {
    const nl = n.toLowerCase();
    if (nl === lower) return n;
    if (nl.startsWith(lower)) hits.push(n);
  }
  if (hits.length === 0) return null;
  const uniq = Array.from(new Set(hits));
  if (uniq.length === 1) return uniq[0];
  let lcp = uniq[0];
  for (const h of uniq) {
    let k = 0;
    while (k < lcp.length && k < h.length && lcp[k].toLowerCase() === h[k].toLowerCase()) k++;
    lcp = lcp.slice(0, k);
  }
  // Keep only whole words of the shared start.
  const endsOnBoundary = uniq.every((h) => !/\w/.test(h.charAt(lcp.length)));
  if (!endsOnBoundary) {
    const i = lcp.lastIndexOf(" ");
    lcp = i > 0 ? lcp.slice(0, i) : lcp;
  }
  lcp = trimTail(lcp);
  return lcp.length > c.length ? lcp : null;
}

/** Operational suffixes riders never need ("Solomos Square Alighting"). */
function dropOperational(name: string): string {
  return name.replace(/\s+(Alighting|Boarding)$/i, "");
}

/** A full, readable headsign from the feed's possibly cut one. */
export function repairHeadsign(headsign: string, names: readonly string[]): string {
  const h = headsign.trim();
  if (!h) return h;
  if (h.length < HEADSIGN_CAP) return displayPlace(h);
  const full = completeCut(h, names);
  return displayPlace(dropOperational(full ?? wordCut(h)));
}

/**
 * Origin and destination from a GTFS long name ("A - B - C"). When the feed
 * cut the name, the tail is completed from the route's own stop names first,
 * then from every stop name, and a fragment that still cannot be completed is
 * cut back to whole words.
 */
export function splitLongName(
  long: string | undefined,
  opts: { routeStopNames?: readonly string[]; allNames?: readonly string[]; firstStop?: string },
): { origin: string; dest: string } {
  const raw = (long ?? "").trim();
  const routeNames = opts.routeStopNames ?? [];
  const all = opts.allNames ?? [];
  const parts = raw.split(SEP).filter(Boolean);
  const fix = (p: string) => completeCut(p, routeNames) ?? completeCut(p, all) ?? p;
  if (parts.length < 2) {
    return { origin: opts.firstStop ?? "", dest: displayPlace(parts[0] ? fix(parts[0]) : "") };
  }
  const origin = displayPlace(fix(parts[0]));
  const capped = raw.length >= LONG_NAME_CAP;
  const tailParts = parts.slice(1);
  if (!capped) return { origin, dest: displayPlace(tailParts.map(fix).join(" - ")) };
  // The last fragment was cut: complete the tail as one stop name if we can.
  const tail = tailParts.join(" - ");
  const whole = completeCut(tail, routeNames) ?? completeCut(tail, all);
  if (whole) return { origin, dest: displayPlace(whole) };
  const last = tailParts[tailParts.length - 1];
  const lastFull = completeCut(last, routeNames) ?? completeCut(last, all);
  const kept = tailParts.slice(0, -1).map(fix);
  if (lastFull) kept.push(lastFull);
  else if (last.length > 3) kept.push(wordCut(last));
  return { origin, dest: displayPlace(kept.join(" - ")) };
}
