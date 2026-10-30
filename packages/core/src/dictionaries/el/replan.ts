// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { replan as replanEn } from "../en/replan";

export const replan: Record<keyof typeof replanEn, string> = {
  "replan.close": "Κλείσιμο",
  "replan.searching": "Αναζήτηση κοντινών λεωφορείων…",
  "replan.empty": "Δεν βρέθηκαν νέες επιλογές, μείνετε εκεί, συνεχίζουμε την παρακολούθηση.",
  "replan.walkOnly": "Μόνο με τα πόδια",
  "replan.bus": "Λεωφορείο {code}",
  "replan.noChange": "χωρίς αλλαγή",
  "replan.changes": "{n} αλλαγή",
  "replan.headToDest": "{mins} προς {dest}",
  "replan.walkingTotal": "{m} μ. βάδισμα συνολικά",
  "replan.keepCurrent": "Διατήρηση τρέχουσας διαδρομής",
  "replan.missed.eyebrow": "Χάθηκε ανταπόκριση",
  "replan.missed.title": "Ας βρούμε άλλο τρόπο.",
  "replan.missed.sub": "Νέες επιλογές από εκεί που είστε.",
  "replan.late.eyebrow": "Καθυστέρηση",
  "replan.late.title": "Θέλετε πιο γρήγορη διαδρομή από εδώ;",
  "replan.late.sub": "Ξανασχεδιάζουμε γύρω από την καθυστέρηση.",
  "replan.atRisk.eyebrow": "Εφεδρικό σχέδιο",
  "replan.atRisk.title": "Αν το χάσετε, να τι ακολουθεί.",
  "replan.atRisk.sub": "Πατήστε μια επιλογή για αλλαγή, ή συνεχίστε αν προλάβετε το λεωφορείο.",
  "replan.lostFeed.eyebrow": "Αλλαγή διαδρομής",
  "replan.lostFeed.title": "Ξανασχεδιάστε από εκεί που είστε.",
  "replan.lostFeed.sub": "Νέες επιλογές από την τρέχουσα θέση σας.",
  "replan.ghostPreBoard.eyebrow": "Φάντασμα λεωφορείο",
  "replan.ghostPreBoard.title": "Αυτό το λεωφορείο δεν στέλνει σήμα.",
  "replan.ghostPreBoard.sub": "Διάλεξε εφεδρεία για να μην μείνεις εκτεθειμένος αν δεν εμφανιστεί.",
  "replan.latePreBoard.eyebrow": "Καθυστέρηση",
  "replan.latePreBoard.title": "Το λεωφορείό σου αργεί.",
  "replan.latePreBoard.sub": "Να τι είναι πιο γρήγορο από την τρέχουσα θέση σου.",
  "replan.walkInstead": "Ή πήγαινε με τα πόδια σε περίπου {mins}",
  "replan.walkInsteadCta": "Με τα πόδια",
  "replan.otherStop": "Το λεωφορείο {code} φεύγει σε {min} λεπ. από {stop}.",
  "replan.otherStopNow": "Το λεωφορείο {code} φεύγει τώρα από {stop}.",
};
