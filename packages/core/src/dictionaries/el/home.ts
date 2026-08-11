// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { home as homeEn } from "../en/home";

export const home: Record<keyof typeof homeEn, string> = {
  "home.whereToday": "Πού θα πάτε σήμερα στη {area};",
  "home.locating": "Εντοπισμός…",
  "home.aroundYou": "Γύρω σας, ζωντανά",
  "home.lastKnown": "Τελευταία γνωστή θέση",
  "home.aroundNicosia": "Γύρω από τη Λευκωσία",
  "home.nearbyStops": "Κοντινές στάσεις",
  "home.planTrip": "Σχεδιασμός διαδρομής",
  "home.liveBuses": "Ζωντανά",
  "home.onTime": "Στην ώρα",
  "home.nextRide": "Επόμενο",
  "home.searchPlaceholder": "Στάση, γραμμή ή λεωφορείο…",
  "home.clear": "καθαρισμός",
  "home.noMatches": "Καμία αντιστοιχία",
  "home.searchHint": "Δοκιμάστε έναν αριθμό γραμμής όπως {example} ή ένα τοπωνύμιο.",
  "home.busLine": "Λεωφορείο {label} γραμμή {code}",
  "home.intercity": "Υπεραστικό",
  "home.urban": "Αστικό",
  "home.noLive": "χωρίς ζωντανά",
  "home.someLive": "{n} ζωντανά",
};
