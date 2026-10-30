// Field validation and multi-frame voting for the card scanner. A value is
// only shown once it passes strict validation AND repeats across frames.

export type FieldKey = "number" | "holder" | "validUntil";

/** Words printed on every Motion card: never part of a holder's name. */
const CARD_WORDS = new Set([
  "MOTION",
  "BUS",
  "CARD",
  "STANDARD",
  "KANONIKH",
  "VALID",
  "UNTIL",
  "CYPRUS",
  "STUDENT",
  "SENIOR",
  "REDUCED",
  "PERSONAL",
  "PERSONALISED",
  "ADULT",
]);

/** Holder name: 2 to 4 words of Latin or Greek capitals, 2+ letters each. */
export function validName(raw: string): string | null {
  const s = raw
    .toUpperCase()
    .replace(/[^A-Z\u0386-\u03AB\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = s.split(" ").filter((w) => w.length >= 2 && !CARD_WORDS.has(w));
  if (words.length < 2 || words.length > 4) return null;
  // Real names have vowels; texture noise like "SST SY SUIS" fails here too.
  if (words.some((w) => !/[AEIOUYΑΕΗΙΟΥΩΆΈΉΊΌΎΏ]/.test(w))) return null;
  if (words.some((w) => /(.)\1\1/.test(w))) return null;
  const joined = words.join(" ");
  if (joined.length < 5 || joined.length > 40) return null;
  return joined;
}

/** DD/MM/YYYY, a real calendar date from today up to 15 years ahead. */
export function validDate(raw: string, now = new Date()): string | null {
  const m = raw.replace(/[^\d/]/g, "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear() + 15, now.getMonth(), now.getDate());
  if (dt < start || dt > end) return null;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

/** Card UID: 14 to 16 digits (separators ignored). */
export function validUid(raw: string): string | null {
  const runs = raw.replace(/[\s-]/g, "").match(/\d{14,16}/g);
  if (!runs) return null;
  const exact = runs.find((r) => r.length >= 14 && r.length <= 16);
  return exact ?? null;
}

/** Card number from a QR payload: the longest 8 to 16 digit run in it. */
export function uidFromQr(payload: string): string | null {
  const runs = payload.match(/\d{8,16}/g);
  if (!runs) return null;
  return runs.sort((a, b) => b.length - a.length)[0];
}

type Tally = { count: number; conf: number };

/**
 * Votes per field across frames. A field is accepted when one candidate has
 * been read `need` times with mean confidence at least `minConf`.
 */
export class Voter {
  private t: Record<FieldKey, Map<string, Tally>> = {
    number: new Map(),
    holder: new Map(),
    validUntil: new Map(),
  };
  accepted: Partial<Record<FieldKey, { value: string; conf: number; source: "qr" | "ocr" }>> = {};

  constructor(
    private rules: Record<FieldKey, { need: number; minConf: number }> = {
      number: { need: 2, minConf: 55 },
      holder: { need: 2, minConf: 65 },
      validUntil: { need: 2, minConf: 55 },
    },
  ) {}

  add(key: FieldKey, value: string, conf: number): boolean {
    if (this.accepted[key]) return false;
    const m = this.t[key];
    const cur = m.get(value) ?? { count: 0, conf: 0 };
    cur.conf = (cur.conf * cur.count + conf) / (cur.count + 1);
    cur.count += 1;
    m.set(value, cur);
    const r = this.rules[key];
    if (cur.count >= r.need && cur.conf >= r.minConf) {
      this.accepted[key] = { value, conf: Math.round(cur.conf), source: "ocr" };
      return true;
    }
    return false;
  }

  /** A QR read is exact: accept immediately. */
  acceptQr(value: string) {
    this.accepted.number = { value, conf: 99, source: "qr" };
  }

  reset(key?: FieldKey) {
    const keys: FieldKey[] = key ? [key] : ["number", "holder", "validUntil"];
    for (const k of keys) {
      this.t[k].clear();
      delete this.accepted[k];
    }
  }
}

/** "4112 3456 7890 12" -> "•••• •••• ••90 12": the last four digits stay visible. */
export function maskDigits(v: string): string {
  const total = (v.match(/\d/g) ?? []).length;
  if (total <= 4) return v;
  let seen = 0;
  return v.replace(/\d/g, (d) => (++seen <= total - 4 ? "\u2022" : d));
}
