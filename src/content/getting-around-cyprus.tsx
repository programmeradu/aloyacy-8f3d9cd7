// Locale copy for the "Getting around Cyprus" guide.
//
// Split out of the route so the page component stays reviewable: this file is
// pure content (English + Greek), the route file is layout and metadata.

import { Link } from "@tanstack/react-router";

import type { Locale } from "@/lib/i18n";

const DESCRIPTION =
  "How to travel Cyprus without a car: intercity coaches between Nicosia, Limassol, Larnaca and Paphos, urban buses in every city, fares, the Motion Bus Card, and live times.";

export type GuideContent = {
  eyebrowDate: string;
  h1Top: string;
  h1Bottom: string;
  intro: string;
  figCaption: string;
  imgAlt: string;
  s1Title: string;
  s1: React.ReactNode;
  s2Title: string;
  s2Lead: string;
  routeWord: string;
  needPair: React.ReactNode;
  s3Title: string;
  s3Lead: string;
  cities: [string, string][];
  s4Title: string;
  s4: React.ReactNode;
  s5Title: string;
  faq: { q: string; a: string }[];
  ctaEyebrow: string;
  ctaLabel: string;
  backLabel: string;
};

export const CONTENT: Record<Locale, GuideContent> = {
  en: {
    eyebrowDate: "A guide / 06.2026",
    h1Top: "Getting around Cyprus",
    h1Bottom: "without a car.",
    intro: DESCRIPTION,
    figCaption: "Inland Cyprus, late afternoon. OSEL urban bus on a village turnaround.",
    imgAlt:
      "An OSEL public bus parked beneath a stone arch in a sun-bleached Cypriot village at golden hour.",
    s1Title: "The shape of the network",
    s1: (
      <>
        <p>
          Cyprus has two layers of public bus. <strong>Intercity coaches</strong> stitch the four
          major cities together — Nicosia, Limassol, Larnaca and Paphos — with a handful of routes
          that double as the country's spine. <strong>Urban buses</strong> then fan out inside each
          city. There is no national rail, so the bus is, in practice, how you cross the island
          without a car.
        </p>
        <p>
          All schedules are GTFS-published, which means live tracking, accurate stop sequences, and
          proper routing are possible. Aloya is built directly on those feeds, plus rider GPS for
          the segments operators don't report.
        </p>
      </>
    ),
    s2Title: "Popular intercity legs",
    s2Lead: "The three workhorse routes most visitors actually use:",
    routeWord: "Route",
    needPair: (
      <>
        Need a different pair?{" "}
        <Link to="/trips" className="underline-offset-4 hover:text-aegean-deep hover:underline">
          Open the planner
        </Link>{" "}
        and search door-to-door.
      </>
    ),
    s3Title: "Urban buses, by city",
    s3Lead:
      "Each city runs its own operator and its own livery. The fare, the card and the app behaviour are the same.",
    cities: [
      ["Nicosia", "OSEL — blue & yellow. Hub: Solomos Square."],
      ["Limassol", "EMEL — green & white. Hub: New Port / Anexartisias."],
      ["Larnaca", "Zenon — orange & white. Hub: Finikoudes seafront."],
      ["Paphos", "OSYPA — green & yellow. Hub: Karavella station."],
      ["Famagusta district", "OSEA — serving Ayia Napa, Paralimni, Protaras."],
      [
        "Airports",
        "Intercity coaches direct from Larnaca (LCA) and Paphos (PFO) to every major city, day and night.",
      ],
      [
        "Park & Ride",
        "Pame Express — free shuttle between GSP stadium parking and central Nicosia.",
      ],
    ],
    s4Title: "Fares, in one paragraph",
    s4: (
      <p>
        Urban single: <strong>€1.50</strong>. Urban day pass: <strong>€5</strong>. Intercity short
        hop: <strong>€4</strong>. Longest intercity leg: <strong>€7</strong>. Pay the driver in
        cash, tap a Motion Bus Card, or pay in-app. Children under 6 ride free. Students and
        pensioners get ~30% off with a registered card.
      </p>
    ),
    s5Title: "Frequently asked",
    faq: [
      {
        q: "Can you get around Cyprus without a car?",
        a: "Yes. Intercity coaches connect all four major cities (Nicosia, Limassol, Larnaca, Paphos) several times a day, and every city runs its own urban bus network. For airports there are direct coaches from Larnaca and Paphos to every city. The main gap is rural Troodos villages and the Akamas — for those a taxi or rental is usually faster.",
      },
      {
        q: "How much does a bus ticket cost in Cyprus?",
        a: "Urban single tickets are €1.50. Intercity coaches are €4 for short hops and €7 for the longest legs (e.g. Paphos – Nicosia). A day pass is €5 in most cities. Children, students and pensioners pay reduced fares with the Motion Bus Card.",
      },
      {
        q: "What is the Motion Bus Card?",
        a: "The Motion Bus Card is the island-wide stored-value card accepted on every urban and intercity bus. You can top it up at kiosks, online, or at the driver. Aloya links to your card balance and shows fare deduction in real time when you tap on.",
      },
      {
        q: "Do Cyprus buses run on Sundays?",
        a: "Urban buses run a reduced Sunday timetable in every city. Intercity coaches run a near-full schedule but with longer gaps after 19:00. Aloya's live times reflect the actual day of the week so you always see what is really departing.",
      },
      {
        q: "How long does the bus take from Larnaca Airport to Nicosia?",
        a: "Roughly 45–55 minutes on the direct intercity coach (route 425 / Kapnos), running every 30–60 minutes from outside Arrivals. Larnaca to Limassol takes ~70 minutes, Larnaca to Paphos ~2h15.",
      },
      {
        q: "Are Cyprus buses reliable?",
        a: "Urban services are generally reliable but can run 5–10 minutes late in afternoon traffic. Intercity coaches are very reliable and rarely cancelled. Aloya overlays live GPS on top of the schedule so a late bus shows as late, not on-time.",
      },
    ],
    ctaEyebrow: "Plan a real trip",
    ctaLabel: "Open the planner",
    backLabel: "← Aloya",
  },
  el: {
    eyebrowDate: "Οδηγός / 06.2026",
    h1Top: "Μετακινήσεις στην Κύπρο",
    h1Bottom: "χωρίς αυτοκίνητο.",
    intro:
      "Πώς να ταξιδέψετε στην Κύπρο χωρίς αυτοκίνητο: υπεραστικά λεωφορεία μεταξύ Λευκωσίας, Λεμεσού, Λάρνακας και Πάφου, αστικά δίκτυα σε κάθε πόλη, εισιτήρια, η κάρτα Motion Bus Card και ζωντανές ώρες αναχώρησης.",
    figCaption: "Ενδοχώρα της Κύπρου, αργό απόγευμα. Αστικό λεωφορείο ΟΣΕΛ σε αναστροφή χωριού.",
    imgAlt:
      "Δημόσιο λεωφορείο ΟΣΕΛ σταθμευμένο κάτω από πέτρινη καμάρα σε ηλιόλουστο κυπριακό χωριό στο χρυσό απόγευμα.",
    s1Title: "Το σχήμα του δικτύου",
    s1: (
      <>
        <p>
          Η Κύπρος έχει δύο επίπεδα δημόσιων λεωφορείων. <strong>Τα υπεραστικά λεωφορεία</strong>{" "}
          συνδέουν τις τέσσερις μεγάλες πόλεις — Λευκωσία, Λεμεσό, Λάρνακα και Πάφο — με λίγες
          γραμμές που λειτουργούν ως η ραχοκοκαλιά της χώρας. <strong>Τα αστικά λεωφορεία</strong>{" "}
          καλύπτουν το εσωτερικό κάθε πόλης. Δεν υπάρχει σιδηρόδρομος, οπότε στην πράξη το λεωφορείο
          είναι ο τρόπος να διασχίσετε το νησί χωρίς αυτοκίνητο.
        </p>
        <p>
          Όλα τα δρομολόγια δημοσιεύονται σε μορφή GTFS, που σημαίνει ότι είναι εφικτή η
          παρακολούθηση σε πραγματικό χρόνο, οι ακριβείς ακολουθίες στάσεων και η σωστή δρομολόγηση.
          Το Aloya κτίζεται απευθείας πάνω σε αυτές τις ροές, μαζί με GPS από τους χρήστες για τα
          τμήματα που δεν αναφέρουν οι μεταφορείς.
        </p>
      </>
    ),
    s2Title: "Δημοφιλείς υπεραστικές διαδρομές",
    s2Lead: "Οι τρεις πιο συχνά χρησιμοποιούμενες διαδρομές:",
    routeWord: "Γραμμή",
    needPair: (
      <>
        Χρειάζεστε άλλο ζεύγος;{" "}
        <Link to="/trips" className="underline-offset-4 hover:text-aegean-deep hover:underline">
          Ανοίξτε τον σχεδιαστή
        </Link>{" "}
        και αναζητήστε διαδρομή από πόρτα σε πόρτα.
      </>
    ),
    s3Title: "Αστικά λεωφορεία, ανά πόλη",
    s3Lead:
      "Κάθε πόλη έχει τον δικό της μεταφορέα και τα δικά της χρώματα. Το εισιτήριο, η κάρτα και η εφαρμογή λειτουργούν παντού το ίδιο.",
    cities: [
      ["Λευκωσία", "ΟΣΕΛ — μπλε & κίτρινο. Κόμβος: Πλατεία Σολωμού."],
      ["Λεμεσός", "ΕΜΕΛ — πράσινο & λευκό. Κόμβος: Νέο Λιμάνι / Ανεξαρτησίας."],
      ["Λάρνακα", "Ζήνων — πορτοκαλί & λευκό. Κόμβος: Φοινικούδες."],
      ["Πάφος", "ΟΣΥΠΑ — πράσινο & κίτρινο. Κόμβος: Σταθμός Καραβέλλα."],
    ],
    s4Title: "Εισιτήρια, σε μία παράγραφο",
    s4: (
      <p>
        Αστικό απλό: <strong>€1.50</strong>. Αστικό ημερήσιο: <strong>€5</strong>. Υπεραστικό
        κοντινό: <strong>€4</strong>. Μακρύτερη υπεραστική διαδρομή: <strong>€7</strong>. Πληρώνετε
        τον οδηγό σε μετρητά, χρεώνετε Motion Bus Card ή πληρώνετε μέσω εφαρμογής. Παιδιά κάτω των 6
        ταξιδεύουν δωρεάν. Φοιτητές και συνταξιούχοι έχουν ~30% έκπτωση με εγγεγραμμένη κάρτα.
      </p>
    ),
    s5Title: "Συχνές ερωτήσεις",
    faq: [
      {
        q: "Μπορείς να μετακινηθείς στην Κύπρο χωρίς αυτοκίνητο;",
        a: "Ναι. Τα υπεραστικά λεωφορεία συνδέουν και τις τέσσερις μεγάλες πόλεις (Λευκωσία, Λεμεσό, Λάρνακα, Πάφο) πολλές φορές την ημέρα, και κάθε πόλη έχει το δικό της αστικό δίκτυο. Για τα αεροδρόμια υπάρχουν απευθείας λεωφορεία από Λάρνακα και Πάφο προς όλες τις πόλεις. Το κύριο κενό είναι τα ορεινά χωριά του Τροόδους και ο Ακάμας — για αυτά συνήθως είναι ταχύτερο ταξί ή ενοικίαση.",
      },
      {
        q: "Πόσο κοστίζει ένα εισιτήριο λεωφορείου στην Κύπρο;",
        a: "Αστικό απλό €1.50. Υπεραστικά €4 για κοντινές διαδρομές και €7 για τις μεγαλύτερες (π.χ. Πάφος – Λευκωσία). Το ημερήσιο πάσο είναι €5 στις περισσότερες πόλεις. Παιδιά, φοιτητές και συνταξιούχοι πληρώνουν μειωμένο εισιτήριο με την Motion Bus Card.",
      },
      {
        q: "Τι είναι η Motion Bus Card;",
        a: "Η Motion Bus Card είναι η παγκύπρια προπληρωμένη κάρτα που γίνεται δεκτή σε όλα τα αστικά και υπεραστικά λεωφορεία. Μπορείτε να την ανανεώσετε σε περίπτερα, διαδικτυακά ή στον οδηγό. Το Aloya συνδέεται με το υπόλοιπο της κάρτας σας και εμφανίζει τη χρέωση σε πραγματικό χρόνο.",
      },
      {
        q: "Λειτουργούν τα λεωφορεία στην Κύπρο τις Κυριακές;",
        a: "Τα αστικά λειτουργούν με μειωμένο πρόγραμμα τις Κυριακές σε κάθε πόλη. Τα υπεραστικά λειτουργούν σχεδόν κανονικά, αλλά με μεγαλύτερα κενά μετά τις 19:00. Οι ζωντανές ώρες του Aloya δείχνουν τι όντως αναχωρεί ανάλογα με την ημέρα.",
      },
      {
        q: "Πόσο διαρκεί το λεωφορείο από το αεροδρόμιο Λάρνακας στη Λευκωσία;",
        a: "Περίπου 45–55 λεπτά με το απευθείας υπεραστικό (γραμμή 425 / Κάπνος), κάθε 30–60 λεπτά έξω από τις Αφίξεις. Λάρνακα – Λεμεσός ~70 λεπτά, Λάρνακα – Πάφος ~2ώ15.",
      },
      {
        q: "Είναι αξιόπιστα τα λεωφορεία στην Κύπρο;",
        a: "Τα αστικά είναι γενικά αξιόπιστα, αλλά μπορεί να καθυστερήσουν 5–10 λεπτά στην απογευματινή κίνηση. Τα υπεραστικά είναι πολύ αξιόπιστα και σπάνια ακυρώνονται. Το Aloya προβάλλει ζωντανά GPS πάνω από το πρόγραμμα, ώστε ένα καθυστερημένο λεωφορείο να φαίνεται καθυστερημένο, όχι στην ώρα του.",
      },
    ],
    ctaEyebrow: "Σχεδιάστε ένα πραγματικό ταξίδι",
    ctaLabel: "Ανοίξτε τον σχεδιαστή",
    backLabel: "← Aloya",
  },
};
