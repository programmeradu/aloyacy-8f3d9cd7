// English source of truth. Add a key here first, then translate in el.ts.
// Use {placeholders} for interpolation: t("greet", { name: "Andreas" }).

export const en = {
  // generic
  "common.back": "Back",
  "common.close": "Close",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.continue": "Continue",
  "common.skip": "Skip",

  // locale switcher
  "locale.label": "Language",
  "locale.english": "English",
  "locale.greek": "Ελληνικά",

  // privacy
  "privacy.title": "Privacy",
  "privacy.eyebrow": "How we handle your data",
  "privacy.updated": "Updated {date}",
  "privacy.intro":
    "Aloya is a tool for riding Cyprus buses. We collect only what is needed to plan trips, show live ETAs, and let your data follow you between devices. We do not sell personal data to anyone.",
  "privacy.section.data": "What we store",
  "privacy.data.body":
    "Your saved places, recent trips, Motion card number and balance, language and notification preferences. Location is read only while you have the app open and is never written to a permanent log.",
  "privacy.section.account": "Your account",
  "privacy.account.body":
    "First open creates an anonymous account on your device. It exists only to give your data a stable identity so it can be backed up to the cloud. When you upgrade to Pro, you may attach an email — at that point the same identity gains a sign-in.",
  "privacy.section.sharing": "Who we share with",
  "privacy.sharing.body":
    "Anonymized vehicle observations are sent to the public realtime feed so other riders see a better ETA. Payment processing is handled by Stripe and JCC. Map tiles are served by Google. We do not run advertising trackers.",
  "privacy.section.rights": "Your rights",
  "privacy.rights.body":
    "You can clear your local data at any time from the browser. To delete your cloud account, write to hello@aloya.cy and we will remove all rows associated with your user id within 30 days.",
  "privacy.section.contact": "Contact",
  "privacy.contact.body":
    "Aloya, Nicosia, Cyprus. Reach the team at hello@aloya.cy.",

  // terms
  "terms.title": "Terms",
  "terms.eyebrow": "The agreement between you and Aloya",
  "terms.updated": "Updated {date}",
  "terms.intro":
    "By using Aloya you agree to the terms below. They exist to protect both you and us, and to keep the service useful for every rider.",
  "terms.section.service": "The service",
  "terms.service.body":
    "Aloya provides travel-planning, live tracking, and a companion experience for Cyprus public transport. Schedules and live data come from the official GTFS feeds; we present them but do not operate the buses. Departures are estimates and can be affected by traffic, weather, and operator decisions.",
  "terms.section.use": "Acceptable use",
  "terms.use.body":
    "Use Aloya for personal travel. Do not scrape, resell, or attempt to disrupt the service. Do not submit false vehicle observations — accurate crowd data is what makes the live ETAs trustworthy.",
  "terms.section.pro": "Aloya Pro",
  "terms.pro.body":
    "Pro features are billed through Stripe on a monthly or annual term. You can cancel at any time from the wallet screen; access continues until the end of the paid period. Refunds are handled case-by-case via hello@aloya.cy.",
  "terms.section.liability": "Liability",
  "terms.liability.body":
    "Aloya is provided as-is. We work hard to keep ETAs accurate, but we cannot guarantee that a bus will arrive at a specific time, that a route will not change, or that the app will be available without interruption. We are not liable for missed connections or losses arising from use of the service.",
  "terms.section.changes": "Changes",
  "terms.changes.body":
    "We may update these terms when the service changes. Material changes are announced in the app at least 14 days before they take effect.",
  "terms.section.law": "Governing law",
  "terms.law.body":
    "These terms are governed by the laws of the Republic of Cyprus.",
} as const;
