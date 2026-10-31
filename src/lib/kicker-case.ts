// Sentence case for all-caps labels that arrive from data (tile kickers like
// "TONIGHT" / "ΑΠΟΨΕ"). Greek capitals carry no accents, so the known kickers
// are mapped to their accented sentence case form.
const EL: Record<string, string> = {
  "ΑΠΟΨΕ": "Απόψε",
  "ΣΕ ΕΞΕΛΙΞΗ": "Σε εξέλιξη",
  "ΣΤΟ ΛΙΜΑΝΙ": "Στο λιμάνι",
  "ΑΡΓΙΑ": "Αργία",
  "ΟΝΟΜΑΣΤΙΚΗ": "Ονομαστική",
  "ΚΑΙΡΟΣ": "Καιρός",
  "ΡΥΘΜΟΣ": "Ρυθμός",
};
const DAYS: Record<string, string> = {
  SUN: "Sunday",
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
};

export function kickerCase(s: string): string {
  if (!s) return s;
  const t = s.trim();
  if (EL[t]) return EL[t];
  const day = /^ON A (SUN|MON|TUE|WED|THU|FRI|SAT)$/.exec(t);
  if (day) return `On a ${DAYS[day[1]]}`;
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2 || letters !== letters.toLocaleUpperCase()) return s;
  const lower = t.toLocaleLowerCase();
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
}
