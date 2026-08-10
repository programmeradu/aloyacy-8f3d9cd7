// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { hud as hudEn } from "../en/hud";

export const hud: Record<keyof typeof hudEn, string> = {
  "hud.liveGuidance": "Ζωντανή καθοδήγηση",
  "hud.startTitle": "Ξεκινήστε τη διαδρομή προς {name}.",
  "hud.startBody":
    "Θα ακολουθήσουμε τα βήματά σας, θα σας πούμε να βιαστείτε αν χρειαστεί, θα σας ενημερώσουμε όταν φτάσετε στη στάση και θα σας οδηγήσουμε έξω την κατάλληλη στιγμή.",
  "hud.startCta": "Έναρξη διαδρομής",
  "hud.hurry.urgentTitle": "Βιαστείτε — το λεωφορείο έρχεται",
  "hud.hurry.softTitle": "Αυξήστε ρυθμό",
  "hud.hurry.headline": "{board} για το λεωφορείο — {walk} με τα πόδια",
  "hud.hurry.urgentBody": "Θα το χάσετε με τον τρέχοντα ρυθμό. Επιταχύνετε ή θα βρούμε το επόμενο.",
  "hud.hurry.softBody": "Θα είναι οριακό. Συνεχίστε και θα το προλάβετε.",
  "hud.walking.toDest": "Περπάτημα στον προορισμό",
  "hud.walking.toStop": "Περπάτημα στη στάση",
  "hud.walking.then": "Μετά",
  "hud.atStop.label": "Είστε στη στάση",
  "hud.atStop.headline": "ΛΕΩΦ {code} σε {min}",
  "hud.atStop.body": "Μείνετε κοντά στο κράσπεδο στη {name}. Θα σας ειδοποιήσουμε μόλις φτάσει.",
  "hud.board.label": "Είστε μέσα;",
  "hud.board.headline": "ΛΕΩΦ {code} — {long}",
  "hud.board.bodyAuto": "Φαίνεται ότι επιβιβαστήκατε. Αυτόματη επιβεβαίωση σε {s}δ.",
  "hud.board.body":
    "Επιβεβαιώστε για να περάσουμε σε λειτουργία διαδρομής και να προσέχουμε τη {name}.",
  "hud.board.onboard": "Είμαι μέσα",
  "hud.board.missed": "Το έχασα",
  "hud.missed.label": "Το λεωφορείο έφυγε",
  "hud.missed.title": "Ας βρούμε το επόμενο.",
  "hud.missed.body":
    "Θα κάνουμε νέο σχεδιασμό από εδώ που είστε, με γειτονικές στάσεις που ίσως έχουν νωρίτερο δρομολόγιο προς {name}.",
  "hud.missed.finding": "Αναζήτηση…",
  "hud.missed.find": "Επόμενο δρομολόγιο",
  "hud.missed.err": "Καμία κοντινή επιλογή. Δοκιμάστε ξανά σε λίγο.",
  "hud.riding.label": "Εντός — ΛΕΩΦ {code}",
  "hud.riding.headline": "Αποβίβαση σε {min} στη {name}.",
  "hud.riding.lost": "Το feed έχασε το λεωφορείο, χρησιμοποιούμε το κινητό σας ως αναφορά.",
  "hud.riding.calm": "Χαλαρώστε. Θα σας ειδοποιήσουμε όταν είναι ώρα να πατήσετε το κουμπί.",
  "hud.riding.imOff": "Κατέβηκα",
  "hud.arrived.label": "Φτάσατε",
  "hud.arrived.title": "Καλώς ήρθατε στη {name}.",
  "hud.arrived.done": "Τέλος",
};
