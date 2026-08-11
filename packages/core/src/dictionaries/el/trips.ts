// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { trips as tripsEn } from "../en/trips";

export const trips: Record<keyof typeof tripsEn, string> = {
  "trips.kicker": "Από πόρτα σε πόρτα",
  "trips.titlePrefix": "Πείτε μας",
  "trips.titleEmph": "πού",
  "trips.titleSuffix": "Θα βρούμε τον δρόμο.",
  "trips.from": "Από",
  "trips.to": "Προς",
  "trips.detecting": "Εντοπισμός τοποθεσίας…",
  "trips.searchPlaceholder": "Αναζήτηση τόπου, διεύθυνσης ή στάσης",
  "trips.clear": "Καθαρισμός",
  "trips.fromWhere": "Από πού;",
  "trips.whereTo": "Προς πού;",
  "trips.searching": "Αναζήτηση",
  "trips.recent": "Πρόσφατα",
  "trips.yourUsuals": "Οι συνήθεις σας",
  "trips.suggestions": "Προτάσεις",
  "trips.bestRoutes": "Καλύτερες διαδρομές",
  "trips.statusComputing": "Υπολογισμός",
  "trips.statusLive": "Ζωντανός συνδυασμός",
  "trips.statusLearned": "Με μάθηση",
  "trips.statusIdle": "Αναμονή",
  "trips.emptyTitleA": "Πού θα θέλατε να πάτε;",
  "trips.emptyTitleB": "Επιλέξτε αφετηρία και προορισμό, οπουδήποτε στο νησί.",
  "trips.emptyBody":
    "Θα σας οδηγήσουμε στην πλησιέστερη στάση, θα επιβιβαστείτε σε πραγματικό λεωφορείο από το ζωντανό feed και θα σας οδηγήσουμε ως την πόρτα. Τέλος στις υποθέσεις για το ποια γραμμή περνά.",
  "trips.noScheduleTitle": "Δεν υπάρχει δρομολόγιο για την ημερομηνία αυτή",
  "trips.noScheduleBody":
    "Δεν έχουμε δημοσιευμένα προγράμματα για {date} ακόμη. Τα δρομολόγια φορτώνονται για τις επόμενες 14 ημέρες — δοκιμάστε ημερομηνία εντός αυτού του εύρους.",
  "trips.noScheduleDay": "αυτή την ημέρα",
  "trips.noRouteTitle": "Δεν βρέθηκε ζωντανή διαδρομή",
  "trips.noRouteBody":
    "Δεν εντοπίσαμε λεωφορείο που να εξυπηρετεί και τις δύο στάσεις την επόμενη ώρα. Δοκιμάστε προορισμό πιο κοντά σε γνωστή γραμμή ή ελέγξτε ξανά σε λίγο.",
  "trips.learnedFromPast": "Από τις προηγούμενες διαδρομές σας",
  "trips.startThis": "Έναρξη αυτής της διαδρομής",
  "trips.fasterOne": "1 ταχύτερη διαδρομή με μετεπιβίβαση",
  "trips.fasterN": "{n} ταχύτερες διαδρομές με μετεπιβιβάσεις",
  "trips.intentArriveBy": "Άφιξη έως",
  "trips.intentLeave": "Αναχώρηση",
  "trips.intentNow": "Τώρα",
  "trips.intentTomorrow": "αύριο {time}",
  "trips.intentPlanArrive":
    "Άφιξη έως {when} — η Aloya μπορεί να παρακολουθεί αυτή την άφιξη πιο κάτω.",
  "trips.intentPlanLeave": "Σχεδιασμός από {when}.",
  "trips.presetToday": "Σήμερα {time}",
  "trips.presetTomorrow": "Αύριο {time}",
  "trips.presetUsual": "συνήθως",
  "trips.planFailed": "Ο σχεδιασμός απέτυχε",
};
