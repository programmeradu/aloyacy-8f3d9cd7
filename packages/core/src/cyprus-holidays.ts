// Official Republic of Cyprus statutory public holidays and transit service resolution.
//
// In Cyprus, all 7 public bus operators (OSEL, EMEL, Zenon, OSYPA, Intercity, OSEA, Pame Express)
// operate on Sunday timetables during statutory public holidays.
//
// Movable feasts follow the Eastern Orthodox liturgical calendar (Meeus Julian algorithm + 13 days).

export interface CyprusHoliday {
  date: string; // YYYY-MM-DD
  dateCompact: string; // YYYYMMDD
  nameEn: string;
  nameEl: string;
  runsSundaySchedule: boolean;
}

/**
 * Calculates Orthodox Easter Sunday for a given Gregorian year (Meeus Julian algorithm with Gregorian correction).
 * Valid for all years in 1900–2099.
 */
export function getOrthodoxEasterSunday(year: number): { month: number; day: number } {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;

  // Convert Julian date to Gregorian (add 13 days for 1900–2099)
  const julianDate = new Date(Date.UTC(year, month - 1, day));
  julianDate.setUTCDate(julianDate.getUTCDate() + 13);

  return {
    month: julianDate.getUTCMonth() + 1,
    day: julianDate.getUTCDate(),
  };
}

function formatDate(year: number, month: number, day: number): { date: string; dateCompact: string } {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return {
    date: `${year}-${mm}-${dd}`,
    dateCompact: `${year}${mm}${dd}`,
  };
}

function addDaysToEaster(year: number, offsetDays: number): { month: number; day: number } {
  const easter = getOrthodoxEasterSunday(year);
  const d = new Date(Date.UTC(year, easter.month - 1, easter.day + offsetDays));
  return {
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Returns all 15 official Republic of Cyprus statutory public holidays for a given year.
 */
export function getCyprusHolidaysForYear(year: number): CyprusHoliday[] {
  const holidays: CyprusHoliday[] = [];

  // Fixed solar public holidays
  const fixedHolidays: Array<{ month: number; day: number; en: string; el: string }> = [
    { month: 1, day: 1, en: "New Year's Day", el: "Πρωτοχρονιά" },
    { month: 1, day: 6, en: "Epiphany", el: "Θεοφάνεια" },
    { month: 3, day: 25, en: "Greek Independence Day", el: "Ευαγγελισμός της Θεοτόκου / Εθνική Επέτειος" },
    { month: 4, day: 1, en: "Cyprus National Day", el: "Εθνική Επέτειος 1ης Απριλίου" },
    { month: 5, day: 1, en: "Labour Day", el: "Εργατική Πρωτομαγιά" },
    { month: 8, day: 15, en: "Assumption of the Virgin Mary", el: "Κοίμηση της Θεοτόκου" },
    { month: 10, day: 1, en: "Cyprus Independence Day", el: "Ημέρα της Κυπριακής Ανεξαρτησίας" },
    { month: 10, day: 28, en: "Ohi Day", el: "Ημέρα του Όχι" },
    { month: 12, day: 25, en: "Christmas Day", el: "Χριστούγεννα" },
    { month: 12, day: 26, en: "Boxing Day", el: "Δεύτερη μέρα Χριστουγέννων" },
  ];

  for (const h of fixedHolidays) {
    const f = formatDate(year, h.month, h.day);
    holidays.push({
      date: f.date,
      dateCompact: f.dateCompact,
      nameEn: h.en,
      nameEl: h.el,
      runsSundaySchedule: true,
    });
  }

  // Movable Orthodox liturgical holidays:
  // 1. Green Monday / Clean Monday (Καθαρά Δευτέρα) = Easter Sunday - 48 days
  const greenMonday = addDaysToEaster(year, -48);
  const fGreen = formatDate(year, greenMonday.month, greenMonday.day);
  holidays.push({
    date: fGreen.date,
    dateCompact: fGreen.dateCompact,
    nameEn: "Green Monday",
    nameEl: "Καθαρά Δευτέρα",
    runsSundaySchedule: true,
  });

  // 2. Good Friday (Μεγάλη Παρασκευή) = Easter Sunday - 2 days
  const goodFriday = addDaysToEaster(year, -2);
  const fGoodFri = formatDate(year, goodFriday.month, goodFriday.day);
  holidays.push({
    date: fGoodFri.date,
    dateCompact: fGoodFri.dateCompact,
    nameEn: "Good Friday",
    nameEl: "Μεγάλη Παρασκευή",
    runsSundaySchedule: true,
  });

  // 3. Easter Monday (Δευτέρα του Πάσχα) = Easter Sunday + 1 day
  const easterMonday = addDaysToEaster(year, 1);
  const fEasterMon = formatDate(year, easterMonday.month, easterMonday.day);
  holidays.push({
    date: fEasterMon.date,
    dateCompact: fEasterMon.dateCompact,
    nameEn: "Easter Monday",
    nameEl: "Δευτέρα του Πάσχα",
    runsSundaySchedule: true,
  });

  // 4. Easter Tuesday (Τρίτη του Πάσχα) = Easter Sunday + 2 days
  const easterTuesday = addDaysToEaster(year, 2);
  const fEasterTue = formatDate(year, easterTuesday.month, easterTuesday.day);
  holidays.push({
    date: fEasterTue.date,
    dateCompact: fEasterTue.dateCompact,
    nameEn: "Easter Tuesday",
    nameEl: "Τρίτη του Πάσχα",
    runsSundaySchedule: true,
  });

  // 5. Pentecost / Holy Spirit Monday / Kataklysmos (Κατακλυσμός) = Easter Sunday + 50 days
  const kataklysmos = addDaysToEaster(year, 50);
  const fKataklysmos = formatDate(year, kataklysmos.month, kataklysmos.day);
  holidays.push({
    date: fKataklysmos.date,
    dateCompact: fKataklysmos.dateCompact,
    nameEn: "Pentecost (Kataklysmos)",
    nameEl: "Αγίου Πνεύματος (Κατακλυσμός)",
    runsSundaySchedule: true,
  });

  return holidays.sort((a, b) => a.dateCompact.localeCompare(b.dateCompact));
}

// Cache by year to avoid repeated computations
const holidayCacheByYear = new Map<number, Map<string, CyprusHoliday>>();

function getHolidayMapForYear(year: number): Map<string, CyprusHoliday> {
  let map = holidayCacheByYear.get(year);
  if (!map) {
    map = new Map();
    const list = getCyprusHolidaysForYear(year);
    for (const h of list) {
      map.set(h.dateCompact, h);
      map.set(h.date, h);
    }
    holidayCacheByYear.set(year, map);
  }
  return map;
}

/**
 * Clean up input date string to YYYYMMDD or YYYY-MM-DD.
 */
function parseYearFromDate(dateStr: string): number | null {
  const clean = dateStr.replace(/[^0-9]/g, "");
  if (clean.length < 4) return null;
  return Number(clean.slice(0, 4));
}

/**
 * Checks if a given date (YYYYMMDD or YYYY-MM-DD) is an official Republic of Cyprus public holiday.
 */
export function isCyprusPublicHoliday(dateStr: string): boolean {
  const year = parseYearFromDate(dateStr);
  if (!year) return false;
  const map = getHolidayMapForYear(year);
  return map.has(dateStr);
}

/**
 * Returns holiday details for a given date if it is a Cyprus holiday, or null if it is a regular day.
 */
export function getCyprusHolidayInfo(dateStr: string): CyprusHoliday | null {
  const year = parseYearFromDate(dateStr);
  if (!year) return null;
  const map = getHolidayMapForYear(year);
  return map.get(dateStr) ?? null;
}

/**
 * Resolves the effective transit day of week (0 = Sunday .. 6 = Saturday).
 * If the date is a statutory Cyprus public holiday, operators run on Sunday timetables,
 * so this returns 0 (Sunday) to match the real-world operating pattern.
 */
export function effectiveTransitWeekday(dateCompact: string): { weekday: number; isHoliday: boolean; holidayNameEn?: string } {
  const holiday = getCyprusHolidayInfo(dateCompact);
  if (holiday && holiday.runsSundaySchedule) {
    return { weekday: 0, isHoliday: true, holidayNameEn: holiday.nameEn };
  }

  const y = Number(dateCompact.slice(0, 4));
  const m = Number(dateCompact.slice(4, 6));
  const d = Number(dateCompact.slice(6, 8));
  const regular = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  return { weekday: regular, isHoliday: false };
}
