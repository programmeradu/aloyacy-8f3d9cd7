// Locale stub — fixed to English/Cyprus so language-dependent formatting is
// deterministic across machines and CI.

export const locale = "en-CY";
export const locales = [
  { languageTag: "en-CY", languageCode: "en", regionCode: "CY", textDirection: "ltr" },
];

export function getLocales() {
  return locales;
}

export function getCalendars() {
  return [{ timeZone: "Asia/Nicosia", calendar: "gregory", uses24hourClock: true }];
}
