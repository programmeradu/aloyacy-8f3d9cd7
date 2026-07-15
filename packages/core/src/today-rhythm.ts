// Weekday × city "what normally happens" notes. Pure data, used by
// composeTodayBriefing as the always-relevant fallback tile.
export type RhythmNote = { title: string; titleEl: string; detail: string; detailEl: string };

export const RHYTHM: Record<string, Record<number, RhythmNote>> = {
  Nicosia: {
    0: {
      title: "Sunday slow-down",
      titleEl: "Κυριακάτικος ρυθμός",
      detail: "Old town quiet until lunch; Ledra Street fills after 17:00 as families walk in.",
      detailEl: "Παλιά πόλη ήσυχη μέχρι το μεσημέρι· η Λήδρας γεμίζει μετά τις 17:00.",
    },
    1: {
      title: "Office Monday",
      titleEl: "Δευτέρα γραφείων",
      detail: "Routes 158 and 259 heaviest 07:30–08:30 and 16:30–18:00 around the ministries.",
      detailEl:
        "Οι γραμμές 158 και 259 φορτώνουν 07:30–08:30 και 16:30–18:00 γύρω από τα υπουργεία.",
    },
    2: {
      title: "Market morning",
      titleEl: "Πρωινό λαϊκής",
      detail:
        "Ochi Square farmers' stalls bring foot traffic 08:00–13:00. Park-and-ride from Pallouriotissa.",
      detailEl: "Πάγκοι παραγωγών στην Πλατεία Ελευθερίας 08:00–13:00.",
    },
    3: {
      title: "Midweek calm",
      titleEl: "Μεσοβδόμαδη ηρεμία",
      detail:
        "Steady all day. Cafés around Faneromeni busy after 19:00 — bus 158 still the smoothest in.",
      detailEl: "Σταθερή κίνηση. Καφέ γύρω από τη Φανερωμένη μετά τις 19:00.",
    },
    4: {
      title: "Thursday students",
      titleEl: "Πέμπτη φοιτητών",
      detail: "UCY and EUC let out around 14:00 — expect crowded 121 and 138 across the river.",
      detailEl: "Πανεπιστήμιο και ΕΠΛ σχολούν 14:00 — φορτωμένες οι 121 και 138.",
    },
    5: {
      title: "Friday night out",
      titleEl: "Παρασκευή έξω",
      detail:
        "Old town tavernas fill from 20:00. Last city buses thin out — plan the return by 22:30.",
      detailEl: "Ταβέρνες στην παλιά πόλη γεμάτες από 20:00. Τελευταία αστικά μετά τις 22:30.",
    },
    6: {
      title: "Saturday brunch",
      titleEl: "Σαββατιάτικο brunch",
      detail: "Strovolos and Engomi cafés rammed 10:00–13:00. Centre quieter than weekdays.",
      detailEl: "Καφέ σε Στρόβολο και Έγκωμη γεμάτα 10:00–13:00.",
    },
  },
  Limassol: {
    0: {
      title: "Beach Sunday",
      titleEl: "Παραλιακή Κυριακή",
      detail:
        "Lady's Mile and Dasoudi packed from 10:00. Seafront route 30 doubles its load by noon.",
      detailEl: "Lady's Mile και Δασούδι γεμάτα από 10:00.",
    },
    1: {
      title: "Port Monday",
      titleEl: "Δευτέρα στο λιμάνι",
      detail: "Old port quiet by morning; new marina lunch rush 12:30–14:00.",
      detailEl: "Παλιό λιμάνι ήσυχο το πρωί· νέα μαρίνα γεμάτη 12:30–14:00.",
    },
    2: {
      title: "Midweek waterfront",
      titleEl: "Μεσοβδόμαδη παραλιακή",
      detail: "Promenade joggers at sunrise; tourist coaches block the seafront 11:00–13:00.",
      detailEl: "Δρομείς στην παραλιακή με την ανατολή· τουριστικά πούλμαν 11:00–13:00.",
    },
    3: {
      title: "Quiet midweek",
      titleEl: "Ήσυχη μεσοβδόμαδη",
      detail: "Routes flow well all day — the easiest Limassol day to get around.",
      detailEl: "Όλες οι γραμμές κυλούν — η πιο εύκολη μέρα.",
    },
    4: {
      title: "Pre-weekend",
      titleEl: "Παραμονή Σαββατοκύριακου",
      detail: "Bar street fills early — by 21:00 the old town walking is faster than driving.",
      detailEl: "Στενά μπαρ γεμάτα νωρίς — μετά τις 21:00 το περπάτημα νικά το αυτοκίνητο.",
    },
    5: {
      title: "Friday seafront",
      titleEl: "Παρασκευή στην παραλιακή",
      detail: "Marina restaurants fully booked 20:00 onwards. Park near Molos and walk.",
      detailEl: "Εστιατόρια στη μαρίνα γεμάτα από 20:00. Πάρκαρε στον Μόλο και πεζός.",
    },
    6: {
      title: "Saturday crowd",
      titleEl: "Σαββατιάτικη συγκέντρωση",
      detail: "Old port to castle is one slow stream of strollers between 18:00 and 23:00.",
      detailEl: "Από το παλιό λιμάνι ως το κάστρο ένα συνεχές ρεύμα κόσμου 18:00–23:00.",
    },
  },
  Larnaca: {
    0: {
      title: "Sunday salt lake",
      titleEl: "Κυριακή στην αλυκή",
      detail: "Promenade Phinikoudes busy 10:00–14:00, then quiet again until sunset.",
      detailEl: "Φοινικούδες γεμάτες 10:00–14:00.",
    },
    1: {
      title: "Airport Monday",
      titleEl: "Αεροδρόμιο Δευτέρα",
      detail: "Shuttles to LCA peak 05:30–07:00 and 18:00–20:00. Route 425 best for early flights.",
      detailEl: "Σαττλ προς αεροδρόμιο 05:30–07:00 και 18:00–20:00.",
    },
    2: {
      title: "Calm midweek",
      titleEl: "Ήσυχη μεσοβδόμαδη",
      detail: "Town quiet, beachfront cafés open. Good day for the Hala Sultan walk.",
      detailEl: "Ήσυχη πόλη, καφέ στην παραλία ανοιχτά.",
    },
    3: {
      title: "Wednesday old town",
      titleEl: "Τετάρτη στην παλιά πόλη",
      detail: "Laiki Geitonia tavernas fill from 19:30 — Mackenzie buses run late.",
      detailEl: "Ταβέρνες στη Λαϊκή Γειτονιά γεμάτες από 19:30.",
    },
    4: {
      title: "Pre-weekend ramp",
      titleEl: "Προς το Σαββατοκύριακο",
      detail: "Phinikoudes promenade busy after 18:00. Bus 421 the smoothest into town.",
      detailEl: "Φοινικούδες γεμάτες μετά τις 18:00.",
    },
    5: {
      title: "Friday Mackenzie",
      titleEl: "Παρασκευή στο Μακένζι",
      detail: "Beach bars from 20:00 onwards. Last buses out before midnight.",
      detailEl: "Beach bars στο Μακένζι από 20:00.",
    },
    6: {
      title: "Saturday seafront",
      titleEl: "Σαββατιάτικη παραλιακή",
      detail: "Promenade and marina full sunrise to late. Parking impossible after 11:00.",
      detailEl: "Φοινικούδες και μαρίνα γεμάτες όλη μέρα.",
    },
  },
  Paphos: {
    0: {
      title: "Sunday harbour",
      titleEl: "Κυριακή στο λιμάνι",
      detail: "Kato Paphos harbour packed 11:00–15:00. Castle photo crowd peaks at sunset.",
      detailEl: "Λιμάνι Κάτω Πάφου γεμάτο 11:00–15:00.",
    },
    1: {
      title: "Mosaics Monday",
      titleEl: "Δευτέρα ψηφιδωτών",
      detail: "Archaeological park opens 08:30. Tourist buses dominate the harbour road by 10:00.",
      detailEl: "Αρχαιολογικό πάρκο ανοίγει 08:30.",
    },
    2: {
      title: "Akamas midweek",
      titleEl: "Ακάμας μεσοβδόμαδα",
      detail: "Quietest day for Aphrodite's Baths trips — bus 622 runs comfortably.",
      detailEl: "Πιο ήσυχη μέρα για Λουτρά Αφροδίτης.",
    },
    3: {
      title: "Old town quiet",
      titleEl: "Ήσυχη παλιά πόλη",
      detail: "Pano Paphos cafés relaxed all afternoon. Good day for the agora.",
      detailEl: "Καφέ στην Άνω Πάφο χαλαρά όλο το απόγευμα.",
    },
    4: {
      title: "Thursday tavernas",
      titleEl: "Πέμπτη ταβέρνες",
      detail: "Geroskipou meze nights from 20:00 — book a table by 19:00.",
      detailEl: "Μεζεδοπωλεία Γεροσκήπου από 20:00.",
    },
    5: {
      title: "Friday harbour",
      titleEl: "Παρασκευή στο λιμάνι",
      detail: "Cocktail bars by the castle fill from 21:00. Last harbour buses around 23:00.",
      detailEl: "Bars δίπλα στο κάστρο γεμάτα από 21:00.",
    },
    6: {
      title: "Saturday Coral Bay",
      titleEl: "Σαββατιάτικος Κόλπος Κοραλλίων",
      detail: "Bus 615 packed all morning — go early or wait it out until 16:00.",
      detailEl: "Γραμμή 615 γεμάτη όλο το πρωί.",
    },
  },
  Cyprus: {
    0: {
      title: "Sunday seaside",
      titleEl: "Κυριακάτικη παραλία",
      detail: "Coastal routes busiest, mountain villages emptiest. Bring a swim and a snack.",
      detailEl: "Παραλιακές γραμμές γεμάτες, ορεινά χωριά άδεια.",
    },
    1: {
      title: "Monday commute",
      titleEl: "Δευτέρα στη δουλειά",
      detail: "Intercity buses peak 06:30–08:30. Quiet again after 09:30.",
      detailEl: "Υπεραστικά γεμάτα 06:30–08:30.",
    },
    2: {
      title: "Midweek calm",
      titleEl: "Ήσυχη μεσοβδόμαδη",
      detail: "Roads moving, sky settled. A good day for a Troodos detour.",
      detailEl: "Καλή μέρα για μια απόδραση στον Τρόοδος.",
    },
    3: {
      title: "Quiet Wednesday",
      titleEl: "Ήσυχη Τετάρτη",
      detail: "Everything flowing. Tourist sites at their most relaxed.",
      detailEl: "Όλα κυλούν. Τουριστικά μέρη χαλαρά.",
    },
    4: {
      title: "Thursday warm-up",
      titleEl: "Πέμπτη με ζεστασιά",
      detail: "City centres pick up after 18:00 as the weekend draws near.",
      detailEl: "Κέντρα πόλεων ζωντανεύουν μετά τις 18:00.",
    },
    5: {
      title: "Friday night",
      titleEl: "Παρασκευή βράδυ",
      detail: "Bars and tavernas across the island full from 20:00 onwards.",
      detailEl: "Μπαρ και ταβέρνες παντού γεμάτες από 20:00.",
    },
    6: {
      title: "Saturday rush",
      titleEl: "Σαββατιάτικη φόρα",
      detail: "Beaches, markets and tavernas peak. Parking premium near the coast.",
      detailEl: "Παραλίες, αγορές, ταβέρνες στο φουλ.",
    },
  },
};
