// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { alerts as alertsEn } from "../en/alerts";

export const alerts: Record<keyof typeof alertsEn, string> = {
  "disruption.label.runningLate": "Προσοχή",
  "disruption.label.connectionAtRisk": "Στενή ανταπόκριση",
  "disruption.label.missedConnection": "Εναλλακτικό σχέδιο",
  "disruption.label.vehicleLostFeed": "Παρακολούθηση",
  "disruption.label.ghostPreBoard": "Φάντασμα λεωφορείο",
  "disruption.label.latePreBoard": "Καθυστέρηση",
  "disruption.fasterRoute": "Βρες πιο γρήγορη διαδρομή",

  "stale.feedStale.label": "Ζωντανή ροή σε παύση",
  "stale.feedStale.detail":
    "Δεν έχουμε πρόσβαση στην υπηρεσία παρακολούθησης τώρα. Οι ώρες είναι προγραμματισμένες — επιστρέφουμε στη ζωντανή μόλις γυρίσει η ροή.",
  "stale.vehicleLost.label": "Παρακολούθηση από το τηλέφωνό σας",
  "stale.vehicleLost.detail":
    "Χάσαμε το λεωφορείο από τη ζωντανή ροή — χρησιμοποιούμε το GPS σας για να κρατήσουμε χάρτη και αντίστροφη μέτρηση ακριβείς μέχρι να επιστρέψει.",
  "stale.nextNotTracked.label": "Το επόμενο λεωφορείο δεν παρακολουθείται ακόμη",
  "stale.nextNotTracked.detail":
    "Το λεωφορείο ανταπόκρισης δεν έχει αρχίσει να στέλνει τη θέση του. Θα εμφανιστεί μόλις ξεκινήσει.",
  "stale.ghostBus.label": "Χωρίς GPS για αυτό το λεωφορείο",
  "stale.ghostBus.detail":
    "Δεν έχουμε λάβει θέση από αυτό το όχημα για πάνω από 3 λεπτά. Δείχνουμε την προγραμματισμένη ώρα — θεωρήστε την εκτίμηση.",

  "eta.tier.live": "ζωντανό",
  "eta.tier.rider": "από επιβάτη",
  "eta.tier.riderOne": "ένας επιβάτης",
  "eta.tier.predicted": "πρόβλεψη",
  "eta.tier.ghost": "χωρίς gps",
  "eta.tier.scheduled": "πρόγραμμα",
  "eta.conf.high": "υψηλή εμπιστοσύνη",
  "eta.conf.med": "μέτρια εμπιστοσύνη",
  "eta.conf.low": "χαμηλή εμπιστοσύνη",
  "eta.minLabel": "λεπτά",
  "eta.opShort": "οπ {m} λεπ",

  "sighting.kicker": "Το βλέπετε το λεωφορείο;",
  "sighting.cta": "Επιβεβαίωση — το βλέπω τώρα",
  "sighting.help":
    "Πατήστε αν το λεωφορείο είναι στη στάση. Το πάτημα σας το ανεβάζει από «χωρίς GPS» για όλους.",
  "sighting.help.seed":
    "Αυτή η γραμμή τρέχει συχνά και σχεδόν κανείς δεν κοιτά. Ένα πάτημα εδώ είναι αυτό που βλέπει ο επόμενος επιβάτης.",
  "sighting.sending": "Αποστολή…",
  "sighting.thanksLabel": "Ευχαριστούμε — επιβεβαιωμένο",
  "sighting.thanksDetail":
    "Οι άλλοι επιβάτες θα δουν αυτή τη διαδρομή ως επιβεβαιωμένη για το επόμενο λεπτό.",
  "sighting.onboard.kicker": "Είστε τα μόνα μάτια στο λεωφορείο {code}",
  "sighting.onboard.cta": "Ναι — είμαι μέσα",
  "sighting.onboard.help":
    "Ο διαχειριστής δεν έχει GPS σε αυτό το λεωφορείο. Το πάτημά σας είναι αυτό που βλέπουν στις επόμενες στάσεις.",
  "sighting.onboard.help.seed":
    "Αυτή η γραμμή τρέχει συχνά και σχεδόν κανείς δεν κοιτά. Το πάτημά σας είναι αυτό που βλέπει η επόμενη στάση.",
  "sighting.onboard.thanksLabel": "Ευχαριστούμε — το βλέπουν",
  "sighting.onboard.thanksDetail":
    "Οι άλλοι επιβάτες θα δουν το λεωφορείο {code} ως επιβεβαιωμένο για το επόμενο λεπτό.",

  "crowd.tag": "Άνεση",
  "crowd.quiet": "Άπλετες θέσεις — ήρεμη διαδρομή.",
  "crowd.moderate": "Μερικές θέσεις ελεύθερες.",
  "crowd.busy": "Γεμάτο — πιθανόν όρθιοι.",
  "crowd.packed": "Πολύ γεμάτο — αν μπορείτε, πάρτε το επόμενο.",
  "crowd.weather.storm": "Καταιγίδα στην άφιξη — πάρτε προστασία.",
  "crowd.weather.rain": "Βροχή στην άφιξη — πάρτε προστασία.",
  "crowd.weather.wind": "Άνεμος στην άφιξη.",
  "crowd.weather.hot": "Ζέστη στην άφιξη ({temp}°).",
  "crowd.weather.cold": "Κρύο στην άφιξη ({temp}°).",
  "crowd.fromRiders": "Από {n} πρόσφατους επιβάτες",

  "lfw.kicker": "Τελευταίο κομμάτι — μεγάλο με τα πόδια",
  "lfw.headPrefix": "Περίπου",
  "lfw.headTo": "ακόμη προς {dest}.",
  "lfw.head": "ακόμη.",
  "lfw.openMaps": "Άνοιγμα στο Google Maps",
  "lfw.line.hike":
    "Είναι αρκετή απόσταση {where} — περίπου {min} λεπτά με τα πόδια. Δεν φτάνει λεωφορείο πιο κοντά, οπότε με ηρεμία ή άλλη φορά.",
  "lfw.line.longNight":
    "Περίπου {min} λεπτά με τα πόδια {where}, και η ώρα προχωρά. Η διαδρομή είναι παρακάτω αν θέλετε να την ακολουθήσετε.",
  "lfw.line.long":
    "Περίπου {min} λεπτά με τα πόδια {where} — μια κανονική βόλτα. Πάρτε χρόνο και ακολουθήστε τη διαδρομή.",
  "lfw.line.warm":
    "Περίπου {min} λεπτά {where}. Έχει ζέστη — πάρτε νερό αν έχετε. Οδηγίες ακριβώς από κάτω.",
  "lfw.line.night":
    "Περίπου {min} λεπτά {where}. Ήσυχοι δρόμοι τέτοια ώρα — η διαδρομή είναι παρακάτω.",
  "lfw.line.default":
    "Περίπου {min} λεπτά με τα πόδια {where} — δεν φτάνει λεωφορείο πιο κοντά. Οι οδηγίες από κάτω.",
  "lfw.toDest": "προς {dest}",
  "lfw.toYourDest": "προς τον προορισμό σας",

  "reliability.label": "Αξιοπιστία",
  "reliability.headline": "Στην ώρα {pct}%",
  "reliability.notEnough": "Μαθαίνουμε τη γραμμή",
  "reliability.subAvgLate": "Μ.ό. {sec}″ αργά",
  "reliability.subAvgEarly": "Μ.ό. {sec}″ νωρίς",
  "reliability.subAvgOnTime": "Μ.ό. στην ώρα",
  "reliability.subLearning": "Δεν υπάρχουν αρκετά δεδομένα ακόμη",
  "reliability.samples": "{n} παρατηρήσεις",
  "reliability.stopEyebrow": "Σε αυτή τη στάση",
  "reliability.stopHeadline": "Στην ώρα {pct}%",
  "reliability.stopLearning": "Μαθαίνουμε αυτή τη στάση",
  "reliability.stopSub": "{n} παρατηρήσεις · μ.ό. {sec}″",
  "reliability.onTime": "στην ώρα",
  "reliability.summaryLearning": "Μαθαίνουμε ακόμη αυτή τη γραμμή",
  "reliability.summaryOnTime": "Συνήθως στην ώρα του",
  "reliability.summaryLateSmall": "Συνήθως ένα-δύο λεπτά αργά",
  "reliability.summaryLateBig": "Συχνά αργεί",
  "reliability.summaryEarlySmall": "Καμιά φορά φεύγει λίγο νωρίς",
  "reliability.summaryEarlyBig": "Συχνά φεύγει νωρίς",
  "reliability.hintLearning": "Δεν υπάρχουν αρκετά δεδομένα ακόμη",
  "reliability.hintHigh": "Ασφαλές για κοντινές ανταποκρίσεις",
  "reliability.hintMedium": "Άφησε λίγο περιθώριο",
  "reliability.hintLow": "Άφησε μερικά λεπτά περιθώριο",

  "rationale.eyebrow": "Γιατί αυτή η επιλογή",
  "rationale.fastest": "Φτάνει {m} λεπτά νωρίτερα",
  "rationale.noChanges": "Χωρίς μετεπιβίβαση",
  "rationale.fewerChangesOne": "Μόνο μία μετεπιβίβαση",
  "rationale.fewerChanges": "Λιγότερες μετεπιβιβάσεις",
  "rationale.lessWalking": "{m} μ. λιγότερο περπάτημα",
  "rationale.allLive": "Ζωντανά δεδομένα σε όλη τη διαδρομή",
  "rationale.moreReliable": "Μικρότερες καθυστερήσεις τώρα",
  "rationale.leavesSooner": "Φεύγει {m} λεπτά νωρίτερα",
  "rationale.bestOverall": "Καλύτερη ισορροπία χρόνου, μετεπιβιβάσεων και περπατήματος",
};
