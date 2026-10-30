// Recent searches, kept on this phone (newest first, max 6).
export type Recent =
  | { kind: "stop"; id: string; label: string }
  | { kind: "line"; id: string; label: string }
  | { kind: "place"; label: string; lat: number; lng: number };

const KEY = "aloya:recent-search";

export function readRecent(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as Recent[]).slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function addRecent(r: Recent) {
  try {
    const list = readRecent().filter((x) => x.label !== r.label);
    localStorage.setItem(KEY, JSON.stringify([r, ...list].slice(0, 6)));
  } catch {
    /* private mode */
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
