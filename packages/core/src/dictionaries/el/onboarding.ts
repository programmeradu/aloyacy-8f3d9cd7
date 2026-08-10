import type { onboarding as onboardingEn } from "../en/onboarding";

export const onboarding: Record<keyof typeof onboardingEn, string> = {
  "welcome.brand": "Aloya",
  "welcome.dismiss": "Κλείσιμο",
  "welcome.step": "{n} από {total}",

  "welcome.loc.eyebrow": "Πού βρίσκεστε",
  "welcome.loc.title": "Η Aloya λειτουργεί καλύτερα όταν ξέρει πού είστε.",
  "welcome.loc.body":
    "Χρησιμοποιούμε την τοποθεσία σας μόνο όσο η εφαρμογή είναι ανοιχτή — για να βρούμε την κοντινότερη στάση και να μετρήσουμε σωστά το επόμενο λεωφορείο.",
  "welcome.loc.cta": "Επιτρέψτε την τοποθεσία",
  "welcome.loc.skip": "Ίσως αργότερα",

  "welcome.notif.eyebrow": "Ένα διακριτικό νεύμα",
  "welcome.notif.title": "Πάρτε ένα ήσυχο μήνυμα πριν φτάσει το λεωφορείο.",
  "welcome.notif.body":
    "Μία ειδοποίηση, ένα λεπτό πριν. Καμία διαφήμιση — μόνο όσα σας βοηθούν να προλάβετε το λεωφορείο.",
  "welcome.notif.cta": "Ενεργοποίηση ειδοποιήσεων",
  "welcome.notif.skip": "Όχι τώρα",
  "welcome.notif.installed":
    "Οι ειδοποιήσεις λειτουργούν μόνο στην εγκατεστημένη εφαρμογή. Προσθέστε την Aloya στην αρχική οθόνη πρώτα.",

  "welcome.card.eyebrow": "Η κάρτα Motion",
  "welcome.card.title": "Προσθέστε την κάρτα σας για να βλέπετε το υπόλοιπο.",
  "welcome.card.body":
    "Προαιρετικό — αποθηκεύεται μόνο στη συσκευή σας εκτός κι αν αναβαθμίσετε αργότερα.",
  "welcome.card.placeholder": "16-ψήφια κάρτα Motion",
  "welcome.card.cta": "Αποθήκευση",
  "welcome.card.skip": "Παράλειψη",

  "welcome.done": "Είστε έτοιμοι.",
  "welcome.done.cta": "Άνοιγμα Aloya",

};
