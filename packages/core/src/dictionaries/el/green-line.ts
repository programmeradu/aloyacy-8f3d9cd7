// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { greenLine as greenLineEn } from "../en/green-line";

export const greenLine: Record<keyof typeof greenLineEn, string> = {
  "gl.eyebrow": "Κυπριακή Δημοκρατία",
  "gl.title": "Η Πράσινη Γραμμή.",
  "gl.lede":
    "Αυτή η εφαρμογή είναι το δίκτυο λεωφορείων της Δημοκρατίας. Η διάβαση προς τα βόρεια είναι άλλο πρόβλημα. Το λέμε ονομαστικά, για να μην μοιάζει η σιωπή με κενό.",
  "gl.know.label": "Τι ξέρουμε",
  "gl.know.network.title": "Μόνο λεωφορεία της Δημοκρατίας",
  "gl.know.network.body":
    "Κάθε ζωντανός αριθμός, κάθε στάση, κάθε γραμμή στην Aloya είναι νότια της γραμμής. Δημόσιες Συγκοινωνίες Κύπρου, EMEL, OSYPA, OSEA και Intercity Buses. Όχι τα βόρεια.",
  "gl.know.ledra.title": "Η οδός Λήδρας είναι η πεζή διάβαση",
  "gl.know.ledra.body":
    "Στην παλιά πόλη, λίγα λεπτά από την Πλατεία Σολωμού. Διαβατήριο ή ταυτότητα. Υπάρχουν και διαβάσεις οχημάτων. Δεν τις λειτουργούμε.",
  "gl.know.famagusta.title": "Αμμόχωστος, σε αυτό το προϊόν",
  "gl.know.famagusta.body":
    "Σημαίνει την λεκάνη της Δημοκρατίας: Παραλίμνι, Δερύνεια, Αγία Νάπα, Πρωταράς. Όχι την πόλη βόρεια της γραμμής. Δεν προσποιούμαστε το αντίθετο.",
  "gl.dont.label": "Τι δεν έχουμε",
  "gl.dont.hours.title": "Επίσημο ωράριο διάβασης",
  "gl.dont.hours.body":
    "Τα τουριστικά ιστολόγια διαφωνούν. Δεν έχουμε επίσημη ροή ωραρίων, οπότε δεν τυπώνουμε ώρα που δεν μπορούμε να υποστηρίξουμε. Ρωτήστε στη διάβαση.",
  "gl.dont.gtfs.title": "GTFS από τα βόρεια",
  "gl.dont.gtfs.body":
    "Δεν υπάρχει δημοσιευμένος κατάλογος στάσεων, ούτε ζωντανά οχήματα, ούτε πρόγραμμα που να μετράμε. Αν δεν είναι στις ροές της Δημοκρατίας, δεν είναι στην Aloya.",
  "gl.search.title": "Η Πράσινη Γραμμή",
  "gl.search.sub": "Δίκτυο Δημοκρατίας. Η διάβαση ονομαστικά, όχι λειτουργία.",
  "gl.search.badge": "Διάβαση",
};
