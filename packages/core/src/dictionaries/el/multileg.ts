// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { multileg as multilegEn } from "../en/multileg";

export const multileg: Record<keyof typeof multilegEn, string> = {
  "ml.changesOne": "Μία αλλαγή",
  "ml.changesN": "{n} αλλαγές",
  "ml.rideOfN": "{label} — διαδρομή {n} από {total}",
  "ml.boardingAdjusted": "Προσαρμογή επιβίβασης",
  "ml.boardingAdjustedBody":
    "Είστε πιο κοντά στη {name}. Το ίδιο λεωφορείο σταματά εδώ — επιβιβαστείτε από αυτή τη στάση.",
  "ml.differentStop": "Διαφορετική στάση",
  "ml.replanFromHere": "Νέος σχεδιασμός από εδώ",
  "ml.tracking": "Ζωντανή παρακολούθηση — θα σας ειδοποιήσουμε όταν χρειαστεί.",
  "ml.minArr": "{m} λεπ — άφ {t}",
  "ml.phase.ready": "Έτοιμοι",
  "ml.phase.walkFirst": "Περπάτημα στην πρώτη στάση",
  "ml.phase.waitFor": "Αναμονή για λεωφορείο {code}",
  "ml.phase.onBus": "Στο λεωφορείο {code} — διαδρομή {n} από {total}",
  "ml.phase.alightNext": "Αποβίβαση επόμενη",
  "ml.phase.walkToBus": "Περπάτημα στο λεωφορείο {code}",
  "ml.phase.finalWalk": "Τελευταίο περπάτημα",
  "ml.phase.arrived": "Φτάσατε",
  "ml.detail.late": "καθυστερεί",
  "ml.detail.liveTracking": "ζωντανή παρακολούθηση",
  "ml.detail.scheduled": "προγραμματισμένο",
  "ml.detail.live": "ζωντανό",
  "ml.detail.mixed": "ζωντανό + πρόγραμμα",
  "ml.hl.walkTo": "Περπατήστε προς",
  "ml.hl.busInBoard": "λεωφορείο {code} σε {min}.",
  "ml.hl.busIn": "Λεωφορείο {code} σε",
  "ml.hl.atName": "στη {name}.",
  "ml.hl.offIn": "Αποβίβαση σε",
  "ml.hl.atNameThenChange": "στη {name} μετά αλλαγή για λεωφορείο {code}.",
  "ml.hl.atNameDot": "στη {name}.",
  "ml.hl.stepOff": "Κατεβείτε",
  "ml.hl.next": "επόμενη",
  "ml.hl.walkForBus": "για λεωφορείο {code} — {min}.",
  "ml.hl.finalStretch": "Τελική απόσταση",
  "ml.hl.minOnFoot": "{m} λεπ με τα πόδια.",
  "ml.hl.youreThere": "Είστε",
  "ml.hl.there": "εκεί",
  "ml.hl.welcome": "καλώς ήρθατε.",
  "ml.hl.doorToDoor": "Από πόρτα σε πόρτα σε",
  "ml.hl.startingOn": "ξεκινώντας με λεωφορείο {code}.",
  "ml.sub.idle": "{changes} στην πορεία. Θα σας καθοδηγήσουμε σε κάθε βήμα.",
  "ml.sub.walkBoard": "Παρακολουθούμε το λεωφορείο όσο περπατάτε.",
  "ml.sub.waitBoard": "Μείνετε κοντά στο κράσπεδο. Πατήστε όταν επιβιβαστείτε.",
  "ml.sub.ridingChange": "Μετά, αλλάζετε για λεωφορείο {code} στη {name}.",
  "ml.sub.ridingSit": "Χαλαρώστε. Θα σας ειδοποιήσουμε όταν είναι ώρα.",
  "ml.sub.alightChange": "Πατήστε το κουμπί — μετά περπάτημα στη {name} για λεωφορείο {code}.",
  "ml.sub.alightFinal": "Πατήστε το κουμπί — τελευταίο περπάτημα στη {name} μετά.",
  "ml.sub.walkTransfer": "Λεωφορείο {code} σε {min}. Συνεχίστε.",
  "ml.sub.walkTransferNo": "Συνεχίστε.",
  "ml.sub.waitConnLate": "Προσοχή — καθυστερεί {m} λεπ από το πρόγραμμα.",
  "ml.sub.waitConn": "Θα σας ειδοποιήσουμε μόλις ανοίξουν οι πόρτες.",
  "ml.sub.finalWalk": "{m} λεπ με τα πόδια προς {name}.",
  "ml.sub.welcome": "Καλώς ήρθατε στη {name}.",
  "ml.act.startTitle": "Ξεκινήστε τη διαδρομή προς {name}.",
  "ml.act.startBody":
    "Θα σας οδηγήσουμε στην πρώτη στάση, θα σας ειδοποιήσουμε όταν πλησιάζει κάθε λεωφορείο, θα σας πούμε πότε να κατέβετε και θα σας καθοδηγήσουμε σε κάθε αλλαγή.",
  "ml.act.startCta": "Έναρξη διαδρομής",
  "ml.act.onBoardQ": "Επιβιβαστήκατε στο λεωφορείο {code};",
  "ml.act.onBoardBody":
    "Πατήστε όταν κάτσετε — θα περάσουμε σε λειτουργία διαδρομής και θα προσέχουμε τη {name}.",
  "ml.act.onBoardCta": "Είμαι μέσα",
  "ml.act.pressStop": "Πατήστε το κουμπί στάσης τώρα",
  "ml.act.imOff": "Κατέβηκα",
  "ml.act.finalLabel": "Τελική απόσταση — {m} λεπ με τα πόδια",
  "ml.act.finalTitle": "Περπάτημα προς {name}.",
  "ml.act.finalBody":
    "Θα κλείσουμε αυτόματα τη διαδρομή όταν φτάσετε — ή πατήστε όταν είστε στην πόρτα.",
  "ml.act.imHere": "Είμαι εδώ",
  "ml.walk.toFirst": "Περπάτημα στην πρώτη στάση",
  "ml.walk.toBus": "Περπάτημα στο λεωφορείο {code}",
  "ml.walk.toDest": "Περπάτημα στον προορισμό",
  "ml.walk.generic": "Περπάτημα",
  "ml.timeline.boardPrefix": "Επιβίβαση",
  "ml.timeline.walkTo": "Περπατήστε προς",
  "ml.timeline.waitAt": "Αναμονή στη {name}",
  "ml.timeline.rideSub": "{from} → {to} — {dep} — {arr} — {n} στάσεις",
  "ml.timeline.walkSub": "{min} — {d} μ",
  "ml.timeline.waitSub": "{min} στη στάση",
  "ml.destBail.walk":
    "Περπάτημα προς {dest} σε {min} λεπ. Το λεωφορείο {route} δεν είναι στον χάρτη.",
  "ml.destBail.keepWait":
    "Το περπάτημα είναι {walk} λεπ. Το λεωφορείο {route} είναι περίπου {wait} λεπ αν εμφανιστεί.",
  "ml.destBail.keepWaitDue":
    "Το περπάτημα είναι {walk} λεπ. Το λεωφορείο {route} δεν είναι στον χάρτη.",
  "ml.destBail.keepWaitChance":
    "Το περπάτημα είναι {walk} λεπ. Το λεωφορείο {route} είναι περίπου {wait} λεπ αν εμφανιστεί. Περίπου {pct}% πιθανότητα να έρθει πριν τις {time}.",
  "ml.destBail.keepWaitDueChance":
    "Το περπάτημα είναι {walk} λεπ. Το λεωφορείο {route} δεν είναι στον χάρτη. Περίπου {pct}% πιθανότητα να έρθει πριν τις {time}.",
  "ml.destBail.flipWalk":
    "Το λεωφορείο {route} είναι τώρα {wait} λεπ αν εμφανιστεί. Το περπάτημα είναι {walk} λεπ — περπατήστε.",
  "ml.destBail.flipWait":
    "Το λεωφορείο {route} είναι περίπου {wait} λεπ αν εμφανιστεί. Το περπάτημα είναι {walk} λεπ — περιμένετε.",
  "ml.destBail.raptorWalk":
    "Το λεωφορείο {route} δεν είναι στον χάρτη. Περπατήστε {walk} λεπ για να πάρετε άλλο λεωφορείο.",
  "ml.destBail.boltScooter":
    "Το λεωφορείο {route} δεν είναι στον χάρτη. Bolt scooter από {price}.",
  "ml.destBail.taxi":
    "Το λεωφορείο {route} δεν είναι στον χάρτη. Ταξί από {price}.",
  "ml.destBail.taxiDoor":
    "Ταξί προς {dest} σε {drive} λεπ, {price}. Το λεωφορείο {route} είναι περίπου {wait} λεπ αν εμφανιστεί.",
  "ml.destBail.taxiDoorDue":
    "Ταξί προς {dest} σε {drive} λεπ, {price}. Το λεωφορείο {route} δεν είναι στον χάρτη.",
};
