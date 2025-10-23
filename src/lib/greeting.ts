// Greek greeting that adapts to the time of day and Cyprus holidays.
// Cyprus / Greek customary usage:
//   05–12  Kalimera        (good morning)
//   12–17  Kalo mesimeri   (good afternoon)
//   17–22  Kalispera       (good evening)
//   22–05  Kalinychta      (good night)

export type Greeting = { word: string; note?: string };

// Compute Orthodox Easter (Meeus / Julian → Gregorian) for a given year.
function orthodoxEaster(year: number): { m: number; d: number } {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  // Convert Julian → Gregorian (add 13 days for 1900–2099).
  const jd = new Date(Date.UTC(year, month - 1, day));
  jd.setUTCDate(jd.getUTCDate() + 13);
  return { m: jd.getUTCMonth() + 1, d: jd.getUTCDate() };
}

export function getGreeting(now: Date = new Date()): Greeting {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const h = now.getHours();

  // Holidays first (override time-of-day).
  if (m === 1 && d === 1) return { word: "Kali chronia.", note: "Happy new year" };
  if (m === 1 && d === 6) return { word: "Kala Fota.", note: "Epiphany blessings" };
  if (m === 3 && d === 25) return { word: "Chronia polla.", note: "Greek Independence" };
  if (m === 4 && d === 1) return { word: "Chronia polla.", note: "Cyprus National Day" };
  if (m === 8 && d === 15) return { word: "Chronia polla.", note: "Feast of the Virgin" };
  if (m === 10 && d === 1) return { word: "Chronia polla.", note: "Cyprus Independence" };
  if (m === 10 && d === 28) return { word: "Chronia polla.", note: "Ohi Day" };
  if (m === 12 && (d === 24 || d === 25 || d === 26))
    return { word: "Kala Christougenna.", note: "Merry Christmas" };
  if (m === 12 && d === 31) return { word: "Kali protochronia.", note: "Happy new year's eve" };

  // Orthodox Easter window (Holy Saturday → Bright Monday).
  const e = orthodoxEaster(now.getFullYear());
  const easter = new Date(now.getFullYear(), e.m - 1, e.d);
  const diffDays = Math.round((now.getTime() - easter.getTime()) / 86_400_000);
  if (diffDays >= -1 && diffDays <= 1) {
    return { word: "Christos anesti.", note: "Christ is risen" };
  }

  // Time of day.
  if (h >= 5 && h < 12) return { word: "Kalimera." };
  if (h >= 12 && h < 17) return { word: "Kalo mesimeri." };
  if (h >= 17 && h < 22) return { word: "Kalispera." };
  return { word: "Kalinychta." };
}
