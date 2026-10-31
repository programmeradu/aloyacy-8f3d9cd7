// Field validation and multi-frame voting for the card scanner. A value is
// only shown once it passes strict validation AND repeats across frames.

export type FieldKey = "number" | "holder" | "category" | "validUntil";
export type FieldSource = "qr" | "barcode" | "ocr";

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

/**
 * Holder name as printed on a Motion card: an initial and the surname
 * ("S ADU-BEREKORANG"), or full words. 2 to 4 tokens of Latin or Greek
 * capitals; single letters only as leading initials; at least one real word.
 */
export function validName(raw: string): string | null {
  const s = raw
    .toUpperCase()
    .replace(/[^A-Z\u0386-\u03AB\s'-]/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const words = s
    .split(" ")
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter((w) => w.length >= 1 && !CARD_WORDS.has(w));
  // A lone hyphenated surname (the initial lost to a faint print) still counts.
  if (words.length === 1 && /^[A-Z\u0386-\u03AB]{3,}(-[A-Z\u0386-\u03AB]{3,})+$/.test(words[0]))
    return words[0].split("-").every((p) => /[AEIOUYΑΕΗΙΟΥΩΆΈΉΊΌΎΏ]/.test(p)) ? words[0] : null;
  if (words.length < 2 || words.length > 4) return null;
  // Initials (one letter) may only lead, and a real word must follow them.
  let i = 0;
  while (i < words.length && words[i].length === 1) i++;
  const rest = words.slice(i);
  if (!rest.length || i > 2) return null;
  if (rest.some((w) => w.length < 2)) return null;
  // Real names have vowels; texture noise like "SST SY SUIS" fails here too.
  if (rest.some((w) => w.split("-").some((p) => !/[AEIOUYΑΕΗΙΟΥΩΆΈΉΊΌΎΏ]/.test(p)))) return null;
  if (words.some((w) => /(.)\1\1/.test(w))) return null;
  const joined = words.join(" ");
  if (joined.length < 5 || joined.length > 40) return null;
  return joined;
}

const CATEGORIES: [RegExp, string][] = [
  [/STANDARD|KANONIK/, "Standard"],
  [/STUDENT|SPOUDAST/, "Student"],
  [/SENIOR/, "Senior"],
  [/REDUCED|MEIOMEN/, "Reduced"],
  [/CHILD|PAIDI/, "Child"],
];

/** Card category from the green box on the front: "18+ Standard", "Student". */
export function validCategory(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9+ ]/g, " ");
  const hit = CATEGORIES.find(([re]) => re.test(s.replace(/\s+/g, "")));
  if (!hit) return null;
  const age = s.match(/\b(\d{1,2})\s*\+/);
  return age ? `${age[1]}+ ${hit[1]}` : hit[1];
}

/** OCR reads a faint 0 as 9, 8 or 6: repair a day or month only when it is impossible as read. */
function repairPair(p: string, max: number): string {
  if (Number(p) <= max) return p;
  return /[986]/.test(p[0]) ? "0" + p[1] : p;
}

/** DD/MM/YYYY, a real calendar date from today up to 15 years ahead. */
export function validDate(raw: string, now = new Date()): string | null {
  const m = raw.replace(/[^\d/]/g, "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dd = repairPair(m[1], 31);
  const mm = repairPair(m[2], 12);
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear() + 15, now.getMonth(), now.getDate());
  if (dt < start || dt > end) return null;
  return `${dd}/${mm}/${m[3]}`;
}

/** Card UID: 14 to 16 digits (separators ignored). */
export function validUid(raw: string): string | null {
  // A run longer than 16 digits is a misread (a doubled digit), never a UID.
  const runs = raw.replace(/[\s-]/g, "").match(/\d+/g);
  return runs?.find((r) => r.length >= 14 && r.length <= 16) ?? null;
}

/** The UID from the back of the card: the digits after "UID:" when OCR found the label. */
export function uidFromLine(raw: string): string | null {
  const at = raw.toUpperCase().search(/U\s*I\s*D|UlD|UID/);
  return validUid(at >= 0 ? raw.slice(at + 3) : raw);
}

/** Card number from a QR payload: the longest 8 to 16 digit run in it. */
export function uidFromQr(payload: string): string | null {
  const runs = payload.match(/\d{8,16}/g);
  if (!runs) return null;
  return runs.sort((a, b) => b.length - a.length)[0];
}

/** The UID from the 1D barcode on the back: 14 to 16 digits, nothing else. */
export function uidFromBarcode(payload: string): string | null {
  const d = payload.replace(/\s/g, "");
  return /^\d{14,16}$/.test(d) ? d : null;
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
    category: new Map(),
    validUntil: new Map(),
  };
  accepted: Partial<Record<FieldKey, { value: string; conf: number; source: FieldSource }>> = {};

  constructor(
    private rules: Record<FieldKey, { need: number; minConf: number }> = {
      // Digit lines score low on Tesseract's confidence even when right; the
      // 14 to 16 digit shape and two agreeing reads carry the weight here.
      number: { need: 2, minConf: 20 },
      holder: { need: 2, minConf: 65 },
      category: { need: 2, minConf: 50 },
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

  /** A QR or barcode read is exact (it carries a checksum): accept immediately. */
  acceptExact(value: string, source: "qr" | "barcode") {
    this.accepted.number = { value, conf: 99, source };
  }

  reset(key?: FieldKey) {
    const keys: FieldKey[] = key ? [key] : ["number", "holder", "category", "validUntil"];
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
