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

  "share.eyebrow": "ΚΟΙΝΟΠΟΙΗΣΗ",
  "share.title": "Στείλε αυτή τη στάση",
  "share.subtitle":
    "Μια ζωντανή, όμορφη κάρτα, στέλνεται ως εικόνα, φτάνει αμέσως σε WhatsApp, iMessage, παντού.",
  "share.previewAlt": "Προεπισκόπηση κάρτας",
  "share.rendering": "ΣΧΕΔΙΑΖΕΤΑΙ…",
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
