# Aloya pitch book

For the founder. For a hotel manager. For a ministry desk. For a grant
reviewer. For someone who has never heard the word GTFS.

**Rule:** if a sentence would not survive the rider app, it does not go
in a room. Same number everywhere. Motion stays the card. We stay the
truth. We do not invent hours, fares, or accuracy we have not measured.

Update the **What exists today** table in the same commit as a
rider-facing slice. Detail lives in [`TRUTH_PLAN.md`](TRUTH_PLAN.md).

---

## 1. How to use this

| You have | Open |
| -------- | ---- |
| 15 seconds in a lift | §3 one-liners |
| 2 minutes with a hotel GM | §8 hotel pitch |
| 5 minutes to demo the phone | §9 demo script |
| A grant form | §10 funding, plus `/internal/funding/docs` |
| An angel who will ask “so what” | §5 moat + §7 vision |
| A “isn’t this Google Maps?” | §11 objections |

Do not send this whole file to anyone. Lift the page that matches the
room. Leave the rest.

---

## 2. What Aloya is (plain)

Cyprus has buses, intercity coaches, an airport shuttle, a pay card
called Motion, and apps that guess.

Aloya is the **honest clock** for getting around the Republic of Cyprus.

You open it and it tells you, in English or Greek:

- which bus is actually coming
- whether to wait, walk, or give up
- whether this stop has shade, a seat, a sign, or two poles
- whether drivers skip this stop
- how to pay (Motion — we do not replace the card)
- how to get from the airport door to town without a lie

We do not drive the buses. We do not sell tickets. We do not pretend we
run the north. We measure what the island already has, and we say it
clearly.

The long version, for people who fund infrastructure:

> Aloya is the clearing house for movement in the Republic of Cyprus —
> the way JCC cleared payments. The citizen app is how people feel it.
> The fused truth engine is how we know. The API is how hotels,
> municipalities and the state plug in.

---

## 3. One-liners (memorise these)

**15 seconds**

> Aloya is the honest bus clock for Cyprus. When the official app is
> wrong, we say so — and we tell you what to do instead.

**30 seconds**

> Every visitor and every Cypriot has the same problem: the bus might
> come, it might skip you, the stop might have no shade at 38 °C, and
> the last one tonight might already have gone. Aloya fuses the
> operator feed with vehicle pings and riders on the bus, and puts one
> honest number on the phone, the stop, and — later — a hotel screen.
> Motion stays the card. We stay the truth.

**The sentence we run the company on**

> Motion stays the card. We stay the truth.

**The sentence for the Ministry**

> We are not taking your buses. We are showing what they did.

**The sentence for a hotel**

> Your guest should not have to guess how to get to the old town. Put
> the same clock we show a rider on your concierge screen.

**The sentence for a grant reviewer**

> Cyprus must publish real-time transit data. Aloya is the citizen-facing
> half of that obligation: a bilingual app that turns the National
> Access Point into something a person can trust.

---

## 4. The problem, as a person feels it

Not TAM. Not “the €4bn mobility market”. A Thursday in Nicosia.

- The app said **4 minutes**. You waited **22**.
- It is **38 °C** and this pole has **no shelter**.
- The bus **drove past** you because the stop is an unmarked pole, or
  the next one 180 m north is the one drivers actually serve.
- You needed **step-free**. Nobody told you there is a kerb.
- It is **21:40** and that was the **last Bus 31 tonight**. Bolt, a
  taxi, or tomorrow — and nobody said so until it was too late.
- You landed at **LCA**. City bus, Kapnos, or the taxi rank? Three
  answers, three prices, one tired family.
- Google is fine for cars. It is polite about buses. Polite is how you
  miss the last intercity.

If we cannot change one of those sentences, we do not deserve a meeting.

---

## 5. What exists today (you can demo this)

Shipped on the rider app (web + iPhone/Android). Silent when we do not
know — that silence is the product.

### Getting there

| What a person sees | In one line |
| ------------------ | ----------- |
| Door to door | Walk, bus, transfer, walk. Why this option, in one line. Silent on a single result. |
| Plain words | “To Larnaca airport tomorrow 7am.” Typed or spoken. Greek or English. |
| Arrive by | A promise, not a hope. We watch weather and delays, then tell you when to walk out. |
| Group trip | One link. Everyone on a map. No account. |
| Live companion | Hurry, board, press the bell, get off. Your phone is the bus if the feed dies. |
| Only eyes | “You're the only eyes on Bus 31.” One tap, on a trip with no GPS. |
| Your stop is next | Stop-by-stop, after the previous doors close — not five stops early. |
| Missed it / disruption | “The bus has left — next one from here.” A Plan B sheet, not a toast. |
| Remind me to leave | A push before you must start walking. Hidden if the bus is already close. |
| Saved places | Home, work, the beach. Recents are free; pins are Pro. |
| Share a plan | A friend opens the meeting point and times before anyone leaves. |
| Share my ETA | A live “watch me arrive” link. |

### The clock at the stop

| What a person sees | In one line |
| ------------------ | ----------- |
| Live board | One arrival time per bus, not three arguing clocks. |
| How fresh | Live, rider-confirmed, one rider, predicted, ghost, or scheduled. We name the uncertainty. |
| One rider | One tap, or one phone on board, is named as one rider. A second phone — tapping or riding — is rider-confirmed. If you left the app, we still ask once: still on Bus 31? |
| Ghost / wait-or-bail | “Bus 31 isn’t on the map. The next one is, 8 min.” Or walk vs wait to your dest. |
| Headway chance | “About 40% chance one arrives before 18:10.” Silent below 15%. |
| No-show | “This 18:00 didn’t run on 3 of the last 10 weekdays.” |
| Last bus tonight | Named. After that: Bolt, a taxi, or tomorrow. |
| Stop condition | Shelter, seat, walk, light, step-free, sign, timetable, two poles. One tap. |
| A photo of the stop | From a rider. Silent when none. That rider’s tap counts twice. Two phones still required. |
| Public stop page | Google only sees a stop when we have something true to say — a rated clock, a skip, or a confirmed attribute. The page tells search engines it is a bus stop in Cyprus, not a blank timetable. |
| Public route page | A bus line is indexable only when we have measured its clock (30 samples). A timetable alone is not a page. |
| Skip rate | “Bus 31 skips this stop about 1 in 5 on weekday evenings. Wave clearly.” The planner also waits as if that extra bus might not stop. |
| Official clock | “The official clock on Bus 31 is usually about 3 min off this hour. We trust a rider on board.” Silent below 8 samples or 2 minutes. We do not say the operator is late. |
| Neighbour stop | “…or use Makarios 180 m north.” Only if that stop is real and does not also skip. |
| It drove past me | One tap. Two riders before we say it. |
| Step-free filter | If you asked: we hide a stop we know has a kerb, when another option exists. |

### The island around the bus

| What a person sees | In one line |
| ------------------ | ----------- |
| Airport | Kapnos vs city bus vs taxi rank. We do not invent a taxi fare. |
| Pay | Tap Motion €1.80 urban / €6 intercity, or pay the driver the published cash fare. |
| Motion pass | The card you already have: balance, history, kiosk QR. Hold it up or tap NFC. |
| Green Line | Named. We do not operate north. Hours not invented. Famagusta here is Paralimni / Deryneia. |
| Pulse / Today | Heat, match night, cruise day, Saharan dust, sea state, a Greek word. The island this morning. |
| Crowd eyes | Which lines have rider phones. The rest of the island is named as dark. |
| Still dark | Busy lines with almost no rider phones. We ask there, not everywhere. |
| Crowd | “Plenty of seats” / “Packed.” From recent riders. Silent without samples. |
| Intercity | Weekend vs weekday patterns. Silent while learning. |
| Park and ride | Drive to the hub, bus in. Live EV-charger counts when the national feed has them. Named as such. |
| Last mile | Nextbike, Bolt scooter, a taxi tariff band after 21:00. Deep-links until they are a real leg. |
| Alerts | Board soon, press the bell, hurry, wait-or-walk flipped. Optional spoken. |
| Greek | Real `/el/` pages, not a flag that pretends. |
| Pro | Optional. Pins, leave-now, offline cache. The clock stays free. |
| Same number | Rider, a future hotel screen, and marketing boards pull the same feed. |

**Impressive because it is rare, not because it is loud.** Nobody else
in Cyprus is collecting whether a stop has shade, whether drivers skip
it, or whether the last bus already ran — and then showing that to the
person standing there. The planner, the group link, and the arrival
promise are how a tourist actually uses it.

**We do not yet have, and we do not claim:**

- a public accuracy page (we will, when a route has enough measured
  arrivals — empty accuracy is a worse lie than no page)
- a sold Truth API or hotel embed (rails are ready; we wait for a
  design partner)
- taxi or Bolt prices (we need a quote)
- Green Line crossing hours
- that we dispatch or “optimise” operators’ fleets
- that bike, scooter, or park-and-ride are first-class legs (they are
  labelled deep-links until they are)
- Apple Wallet, a home-screen widget, Live Activities, or AR
- that Pro gets a faster feed (everyone polls the same clock)

---

## 6. What we just built (the truth engine, in human)

This is the part that makes Aloya hard to copy. Say it simply.

1. **We write down what we told you.** Every ETA that hits a screen is
   a ledger row. You cannot improve a promise you never recorded.
2. **We find out when the bus actually arrived.** Not the operator’s
   own claim — a vehicle ping crossing the stop, or a rider on board.
3. **We will score ourselves in public** once there are enough samples.
   Our error vs their error. n and source, always.
4. **Riders correct the map** without becoming unpaid staff. One
   question per ride, at the stop, where the answer is free. Shelter?
   Two poles? It drove past? A photo.
5. **Furniture expires.** A shelter can be removed. After 90 days a
   claim falls back or goes quiet. “Confirmed by 4 riders, last 12
   days ago.”
6. **A skip is a measurement.** Enter and leave the stop without
   dwelling → skipped. A real kerb stop → served. Sparse pings stay
   unknown. We only speak at 1 in N, when it is common enough to
   change what you do with your arm.
7. **A phone that has been right can stand alone.** Two riders agree,
   or one rider whose GPS has matched real arrivals. A first-time tap
   is named as one rider.
8. **When the operator clock and a rider disagree, we write it down.**
   How far apart, this route, this hour. We say “off”, not “optimistic”.
   Silent until eight samples and two minutes.

That is the moat: **ground truth that is not an ETA**, collected in
Cyprus, in Greek and English, on the same clock the rider sees.

Google can import a timetable. It will not stand at a pole in July and
learn there is no shade.

---

## 7. Vision — and the order we do not skip

**Horizon 1 — Demand (now).** Win the rider. Tourist, student, parent,
hotel guest. The app is the proof.

**Horizon 2 — Truth (in flight).** Own the fused clock. Stop condition,
skip, reliability, ghost. This is what others will want to buy.

**Horizon 3 — Switch (when a partner is waiting).** One API, one
embed, one PDF report card. Hotels, kiosks, municipalities, CyNAP.
Same classifier as the phone.

**Horizon 4 — Settlement (later, with a contract).** Motion remains
the card. We sit on it the way Apple Pay sits on Visa. No fake wallet.

**Horizon 5 — Islands (after Cyprus is measured).** Malta, Crete, the
same GTFS-RT gap. Not a 2028 slide. Not this year’s plan.

We do **not** build a command center. Uber has one because Uber runs
the cars. A Cyprus command center with levers would look like a threat
to OSEL, EMEL, Intercity and the Ministry. The OS is the app + the
truth + thin embeds.

---

## 8. Who you are talking to

### A. Anyone, 2 minutes

“Open the stop you actually wait at. See the time. See if we are
guessing. See if you should wait or walk. See if there is shade. If
the bus is a ghost, we will not keep you there out of politeness.”

### B. Hotel / concierge / airport

**Pain:** guests ask “how do I get to Nicosia?” and staff Google it.

**Pitch:** a screen or a link that shows the same departures a rider
sees. Not a white-label app. A clock. First design partner, not a
platform.

**Do not promise:** a live embed this week. Promise a conversation and
a waitlist (`aloya.cy/partners`). The widget ships with the first
paying API customer.

**Ask:** “Let us put one stop — yours — on a page you can trust. If
the number is wrong, it is the same wrong as the guest’s phone, and we
will say we do not know.”

### C. Operator / Ministry

**Pain:** they are blamed for a feed they did not build for citizens.

**Pitch:** promised vs actual, per agency, with n. A page and a PDF.
No levers. We are the witness, not the dispatcher.

**Ask:** a letter of support for a RIF / CEF bid, and a named person
who will look at the first report card.

### D. Angel / seed

**Pain:** “bus apps do not exit.”

**Pitch:** we are not a bus app. We are the trust file for movement on
an island that must publish this data under EU law and currently has
no citizen-grade consumer of it. Demand first (the app), truth second
(the ledger + ground truth nobody has), switch third (API / embed).
Replication is other Mediterranean islands with the same gap — after
Cyprus works.

**Ask:** see §12. Do not raise on a Malta slide.

### E. Grant reviewer

Use the dedicated funding doc (`/internal/funding/docs`) for
instrument mechanics. In the room, say:

> Novelty is not another planner. Novelty is fusing the official feed
> with riders and vehicles until the number is honest, then publishing
> the score.

---

## 9. Five-minute demo (phone, standing)

Do this on a real Nicosia stop, not a screenshot.

1. **Home.** Nearby stops. Speak English, then flip to Greek. “Both
   are first-class.”
2. **Plain words.** Type “to Larnaca airport tomorrow 7am.” “A tourist
   should not have to know a stop code.”
3. **Arrive by.** Set a clock. Show the promise. “We will move you
   earlier if the bus is slipping — we will not hope.”
4. **Open a stop.** Point at the time. Point at the freshness word.
   “If it is a ghost, watch what we tell you to do.”
5. **Wait-or-bail.** If a bus is missing: the next one, or walk vs
   wait. “We do not trap you.”
6. **Last / no-show** if it is evening. “This is how you do not sleep
   at the station.”
7. **Stop condition.** Shelter, seat, light, two poles. One question
   only. “We do not quiz you for eight things on one wait.”
8. **Skip line** if it is speaking. Wave clearly, or the neighbour
   stop with a measured distance. “We will not invent a stop 200 m
   north.”
9. **Group trip.** Open the shared link. Friends on a map. “A hen
   party should not SMS screenshots.”
10. **Airport job** if they care about tourists. Kapnos vs city bus vs
    rank. “No invented taxi fare.”
11. **Pay line.** Motion. Scan the card. “We are not a new card.”
12. **Pulse** if it is speaking. Heat, a cruise, dust. “The island,
    this morning — not a generic weather icon.”
13. **Close.** “Everything you saw is the same data a hotel screen
    would show. That is the company.”

If a feature is silent, say **“we do not know yet”** and move on. That
line wins more rooms than a fake number.

---

## 10. Funding (solo founder, practical)

Existing instrument playbook: `/internal/funding` (internal, not for
forwarding as-is). Short version:

| Instrument | Why it fits | Do not |
| ---------- | ----------- | ------ |
| **RIF Fast Track** (€50–150k, ~3 months) | First money. Frame: AI-fused reliability layer, rider signals correcting GTFS-RT gaps. Deliverable: trust you can see in the app + feed quality per operator. | Promise a command center or a public accuracy page with empty n. |
| **ESF+ / AnAD** | Funds people, not software. Aloya is the training tool for older riders, hotel staff, municipal clerks. | Ask it to pay for engineering. |
| **CEF Digital / MMTIS** | Cyprus NAP obligation. Consortium with a university + an operator. | Lead a giant bid year one. |
| **Interreg Euro-MED** | Later, with Malta or Crete as co-applicant, once the product is real. | Use as this year’s story. |
| **EIC Accelerator** | 2027+ if there are paying users and a ministry letter. | Pretend we are ready. |

**First 90 days of fundraising (product-true):**

1. Demo the stop to three hotel GMs and one municipal tourism person.
   Capture names, not logos.
2. File RIF Fast Track on the truth engine (ledger + skip + stop
   condition), not on “AI journey planner”.
3. One operator conversation: report card as a PDF, no levers.
4. Do not hire a deck designer before a partner has seen the phone.

---

## 11. Objections (answer in one breath)

**“It’s just another bus app.”**
Journey planners exist. An honest clock does not. We tell you when we
are guessing, when the bus skipped you, and when to walk.

**“Google Maps already does this.”**
Google is a car product with a bus layer. It will not tell you this
pole has no shelter, that Bus 31 skips it 1 in 5 evenings, or that
the last one tonight already left.

**“You compete with Motion / the operators.”**
No. Motion is the card. Operators run the buses. We make both usable.
A threat looks like a dispatcher console. We will not build one.

**“What’s the revenue?”**
Today: demand (the app) and grants that fund truth as infrastructure.
Next: a Truth API and a hotel/municipality embed, same number, paid
when someone is waiting for keys. Not ads on a ghost bus.

**“Show me accuracy.”**
We are logging every promise and resolving actual arrivals. A public
page ships when a route has enough headline samples. Until then,
shipping an empty accuracy page would be the kind of lie we are here
to stop.

**“Can you do Malta?”**
Same shape of problem. Cyprus first, measured. Then the islands.

**“AI?”**
We do not sell AI. We sell a measured second, a shaded stop, and a
sentence that tells you to wave.

---

## 12. The ask (pick one, say it last)

**Hotel / municipality**
> Give us one stop and one screen. Ninety days. If the clock is worse
> than what you do now, we leave.

**Operator / Ministry**
> Look at one report card — promised vs actual, with n. If it is fair,
> a letter of support for the RIF bid.

**Angel**
> Fund the truth engine in Cyprus, not a map of the Mediterranean.
> The app is live. The ledger is writing. The next sale is an embed
> that cannot lie differently from the phone.

**Grant**
> Fund the measurement that EU law already requires Cyprus to have,
> in a form a rider, a tourist, and a hotel can use.

---

## 13. Ten-slide outline (if you must make a deck)

1. The Thursday in Nicosia (problem, felt)
2. One sentence: honest clock / Motion the card / we the truth
3. Phone screenshot: a real stop, a real ghost, a real next step
4. What we measure that no one else does (shade, skip, last bus)
5. How (feed + pings + riders → one number)
6. Who it is for (rider, tourist, hotel, state)
7. Sequence: demand → truth → switch → settlement. Not skippable.
8. What is live vs what is next (this table, honest)
9. Why we win (ground truth, bilingual, already on the island)
10. The ask

Photography: Cyprus or nothing. No purple. No “AI-powered” badge. No
logo wall of companies that are not here.

---

## 14. Words we never put in a pitch

- command center, dashboard for dispatchers, “we optimise the fleet”
- one fare, Aloya Pay, Wallet pass (until there is a contract)
- guaranteed ETA, “always on time”, a percentage without n
- Famagusta-as-the-north, Green Line hours we did not publish
- Malta / 2028 OS as a near-term milestone
- “AI-powered”, “OS for everything”, sixteen mode cards

If you are tempted, open the rider app and see whether that sentence
is on the stop. If it is not, it is not in the room.

---

## 15. What’s next (so you do not over-promise)

Unblocked, in plan order — see the living checklist in TRUTH_PLAN:

- Device reputation (how often this phone was right) and a cold-start question
- Public stop pages, once they have real content
- Accuracy page, once a route has enough measured arrivals
- Truth API + hotel embed, once a design partner is waiting
- Skip penalty in routing, once skip visits exist
- Sunday/holiday last-bus, once a calendar is published

If they ask “when is the API?”, the true answer is: **when someone is
waiting to use it, and the ledger is already writing.** Both are in
motion. Do not quote a month you cannot defend.

---

## 16. Closing line

Leave with this, not a QR code collage:

> We are building the clock Cyprus should have had when the feeds
> opened. The buses are theirs. The card is Motion. The truth is
> ours — and it is the same truth on the rider’s phone and on a
> partner’s screen.

Then show the stop. Then stop talking.
