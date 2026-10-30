// Greek translations. Keep keys aligned with the matching en/ file. Missing keys fall back
// to English at runtime, so partial coverage is safe to ship.

import type { saved as savedEn } from "../en/saved";

export const saved: Record<keyof typeof savedEn, string> = {
  "saved.kicker": "Ο άτλας σας",
  "saved.titlePrefix": "Τα μέρη που",
  "saved.titleEmph": "μετράνε",
  "saved.heroPinned": "{n} καρφιτσωμένα",
  "saved.heroTitle": "Παραθαλάσσια σαββατοκύριακα",
  "saved.heroBody":
    "Καρφιτσώστε ένα μέρος μία φορά. Σχεδιάστε διαδρομή προς αυτό από οποιαδήποτε οθόνη, αμέσως.",
  "saved.pinned": "Καρφιτσωμένα",
  "saved.noPinsTitle": "Καμία καρφίτσα ακόμη",
  "saved.noPinsBody":
    "Σχεδιάστε μια διαδρομή και καρφιτσώστε τον προορισμό, ή επιλέξτε από τις πρόσφατες διαδρομές παρακάτω.",
  "saved.planTrip": "Σχεδιασμός διαδρομής",
  "saved.unpin": "Αφαίρεση",
  "saved.recent": "Πρόσφατα",
  "saved.recentEmpty": "Οι τελευταίοι προορισμοί σας θα εμφανίζονται εδώ.",
  "saved.favourite": "Αγαπημένο",
  "saved.placeholderHome": "Σπίτι",
  "saved.save": "Αποθήκευση",
  "saved.pin": "Καρφίτσωμα",
  "saved.coastAlt": "Κυπριακή ακτή",

  "shortcut.kicker": "Παράκαμψη;",
  "shortcut.title": "Είστε {m} μ. από {dest}.",
  "shortcut.body":
    "Λίγα λεπτά με τα πόδια είναι πιο γρήγορα από το επόμενο λεωφορείο. Θέλετε να συνεχίσετε με τα πόδια;",
  "shortcut.walkRest": "Συνέχεια με τα πόδια",
  "shortcut.stayOnPlan": "Μένω στο σχέδιο",

  "remind.set": "Υπενθύμιση ενεργή",
  "remind.saving": "Αποθήκευση…",
  "remind.cta": "Υπενθύμισέ μου",
  "remind.ctaPro": "Υπενθύμισέ μου · Pro",
  "remind.foot":
    "Θα ξαναελέγξουμε καιρό και κίνηση και θα σας ειδοποιήσουμε λίγο νωρίτερα αν χρειαστεί.",
  "remind.error": "Αδυναμία προγραμματισμού υπενθύμισης",
  "remind.authTitle": "Συνδεθείτε για να αποθηκεύσετε υπενθυμίσεις",
  "remind.authSubtitle": "Θα σας ειδοποιήσουμε όταν είναι ώρα να φύγετε.",
};
