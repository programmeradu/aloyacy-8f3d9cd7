// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { pro as proEn } from "../en/pro";

export const pro: Record<keyof typeof proEn, string> = {
  "proacc.brand": "Aloya",
  "proacc.brand2": " Pro",
  "proacc.active": "Ενεργή",
  "proacc.headline": "Όλα τα features ξεκλειδωμένα.",
  "proacc.plan": "Πλάνο",
  "proacc.renews": "Ανανέωση",
  "proacc.ends": "Λήγει",
  "proacc.account": "Λογαριασμός",
  "proacc.manage": "Διαχείριση",
  "proacc.opening": "Άνοιγμα…",
  "proacc.signOut": "Αποσύνδεση",
  "proacc.errPortal": "Αδυναμία ανοίγματος χρέωσης",
  "proacc.plan.weekly": "Εβδομαδιαίο — €1.99",
  "proacc.plan.monthly": "Μηνιαίο — €6.99",
  "proacc.plan.default": "Aloya Pro",

  "proup.taglineLead": "Άκου το λεωφορείο σου. Σχεδίασε μετεπιβιβάσεις.",
  "proup.taglineTail": "Μείνε εκτός σύνδεσης.",
  "proup.priceFromPrefix": "Από",
  "proup.priceFromSuffix": "/εβδ — ακύρωση όποτε θες",
  "proup.tryPro": "Δοκίμασε Pro",
  "proup.unlock": "Ξεκλείδωσε με Pro",
};
