// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { stop as stopEn } from "../en/stop";

export const stop: Record<keyof typeof stopEn, string> = {
  "stopCard.code": "Στάση {code}",
  "stopCard.towards": "προς {name}",
  "stopCard.noLiveBus": "δεν υπάρχει ζωντανό λεωφορείο",
  "stopCard.minAway": "λεπ μακριά",

  "stop.unknown": "Άγνωστη στάση",
  "stop.serviceIntercity": "Υπεραστική γραμμή",
  "stop.serviceUrban": "Αστική γραμμή",
  "stop.notInDataset": "Η στάση δεν υπάρχει στα τρέχοντα δεδομένα",
  "stop.busesServingOne": "1 λεωφορείο εξυπηρετεί τη στάση",
  "stop.busesServingN": "{n} λεωφορεία εξυπηρετούν τη στάση",
  "stop.noBusesNear": "Κανένα λεωφορείο κοντά στη στάση αυτή τη στιγμή",
  "stop.departures": "Αναχωρήσεις",
  "stop.loading": "Φόρτωση",
  "stop.liveSmart": "Ζωντανή, έξυπνη άφιξη",
  "stop.noUpcomingTitle": "Καμία επερχόμενη αναχώρηση",
  "stop.noUpcomingBody":
    "Το ζωντανό feed δεν έχει τίποτα προγραμματισμένο για αυτή τη στάση τις επόμενες 3 ώρες.",
  "stop.minShort": "λεπ",
  "stop.opShort": "πρ {m}",
  "stop.routeFallback": "Γραμμή",
  "stop.kicker": "Στάση {code}",
  "stop.routeKicker": "Γραμμή",
  "stop.scheduledAt": "Πρόγραμμα · {time}",
  "stop.fromLabel": "Από {name}",
  "stop.headedTo": "Προς",
  "stop.nextDepartures": "Επόμενες αναχωρήσεις",
  "stop.heroEyebrow": "Σε αυτή τη στάση",
  "stop.heroNote":
    "Ο χρόνος άφιξης συνδυάζει δεδομένα μεταφορέα, ζωντανά στίγματα οχημάτων και αναφορές επιβατών — μία ειλικρινής ένδειξη ανά αναχώρηση.",
};
