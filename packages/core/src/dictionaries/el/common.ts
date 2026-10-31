// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { common as commonEn } from "../en/common";

export const common: Record<keyof typeof commonEn, string> = {
  "common.back": "Πίσω",
  "common.close": "Κλείσιμο",
  "common.save": "Αποθήκευση",
  "common.cancel": "Άκυρο",
  "common.continue": "Συνέχεια",
  "common.skip": "Παράλειψη",
  "common.loading": "Φόρτωση…",
  "common.retry": "Δοκιμή ξανά",
  "common.minShort": "λεπ",
  "common.kmAway": "{km} χλμ μακριά",
  "common.mAway": "{m} μ. μακριά",
  "common.minUnit": "λεπ",

  "resume.label": "Διαδρομή σε εξέλιξη",
  "resume.busTo": "Λεωφορείο {code} προς",
  "resume.cta": "Συνέχεια",

  "nav.explore": "Χάρτης",
  "nav.trips": "Ταξίδια",
  "nav.pulse": "Παλμός",
  "nav.saved": "Αγαπημένα",
  "nav.pass": "Κάρτα",

  "locale.label": "Γλώσσα",
  "locale.english": "Αγγλικά",
  "locale.greek": "Ελληνικά",

  "share.eyebrow": "Κοινοποίηση",
  "share.title": "Μοιράσου αυτή τη στάση",
  "share.subtitle": "Στέλνεται ως εικόνα με σύνδεσμο, για να ανοίγει παντού.",
  "share.previewAlt": "Προεπισκόπηση κάρτας",
  "share.rendering": "Σχεδιάζεται η κάρτα",
  "share.cardFailed": "Η εικόνα δεν φόρτωσε. Μπορείς ακόμα να αντιγράψεις τον σύνδεσμο.",
  "share.airport.title": "Μοιράσου αυτό το αεροδρόμιο",
  "share.line.title": "Μοιράσου αυτή τη γραμμή",
  "share.group.title": "Κάλεσε άτομα στην ομάδα",
  "share.share": "Κοινοποίηση",
  "share.whatsapp": "WhatsApp",
  "share.save": "Αποθήκευση",
  "share.copyLink": "Αντιγραφή",
  "share.copied": "Αντιγράφηκε",
  "share.close": "Κλείσιμο",
  "share.openLabel": "Κοινοποίηση στάσης",
  "share.waFallback": "Η εικόνα αποθηκεύτηκε, επισυνάψτε την στο WhatsApp",
  "share.saved": "Αποθηκεύτηκε στη συσκευή σας",
  "share.plan.cta": "Μοιράσου το πλάνο",
  "share.plan.creating": "Δημιουργία συνδέσμου…",
  "share.plan.copied": "Ο σύνδεσμος είναι έτοιμος, μοιράσου τον",
  "share.plan.retry": "Δοκίμασε ξανά",
  "share.plan.title": "Πλάνο διαδρομής",
  "share.plan.text": "Το πλάνο μας για να φτάσουμε στο {where}.",
};
