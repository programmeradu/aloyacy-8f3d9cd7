# Part E: Product, growth, business and quality (layers 41 to 50)

Author: research subagent, 31 Oct 2026 (EET). Repo read: programmeradu/aloyacy-8f3d9cd7, branch redesign-roam (via the GitHub API and raw files; the sandbox shell was unavailable all session). Live app tested: https://aloya-app.samueladuberekorang.workers.dev on 31 Oct 2026 19:34 EET.

Conventions: every number below comes from the cited source. Where something is my inference it is marked "inferred". Effort: S (days), M (2 to 6 weeks), L (more than 6 weeks).

---

## Layer 41. Competitor teardown and gap matrix

### 1) What the best in the world do
- Citymapper: GO mode with step by step guidance, get-off alerts that work offline, a Lock Screen Live Activity, and live ETA sharing by link that recipients open on the mobile web without the app. Citymapper made its Club features free in version 11 and kept an ad-free tier. Via later acquired Citymapper. Sources: citymapper.com/news/867, Citymapper store listings.
- Transit (Montreal): GO crowdsourcing, where riders who tap GO share their bus position with riders downstream at 1 to 2 seconds latency instead of the roughly 15 seconds of a typical transponder; Share Trip launched 1 Sept 2026 with automatic stop on arrival; Royale subscription (USD 24.99 per year or 4.99 per month) that more than 150 agencies sponsor for all their riders. Sources: blog.transitapp.com/autogo, nowtoronto.com (2 Sept 2026), transitapp.com/en/features/share-live-trips.
- Moovit: 1.5 billion users in 112 countries; covers Cyprus (NPT, EMEL, OSYPA, Intercity, Kapnos) with live directions and get-off notifications; Moovit+ (2023) paywalls SafeRide trip sharing, Compare Routes, Arrival Updates and Live Location; sells white-label MaaS and analytics to governments. Sources: moovit.com press releases (31 Jul 2023, 22 Nov 2023), moovitapp.com Nicosia pages.
- Google Maps: CPT told the Audit Office on 15 Oct 2026 that all CPT routes are on Google Maps; EMEL live ETAs went live early 2026 and intercity was added on 11 Mar 2026 (from earlier research in this session).
- Apple Maps: no transit directions in Cyprus (Cyprus is absent from Apple's feature availability list, which includes Greece).
- ummadum (Tyrol, Austria; the likely meaning of "Umadum"): rewards kilometres by bike, foot, public transport or carpool with points (1 point = 1 cent) redeemable at local shops, funded by municipalities and employers. 10K+ downloads, rating 4.1. No Cyprus presence found.

### 2) Reality in Cyprus and the data available
- Official app Pame (Cyprus Public Transport, built by Meep): live arrivals, map, planner, Motion top-up. Meep claims 130K+ downloads, 8K+ active users, 1M+ planned trips. Play rating about 2.8 to 3.1. Reviews complain that login is forced to see fares and timetables and that Greek search is weak.
- Ministry "Cyprus Bus" (GMV): iOS rating 2.0, Play 2.3 to 2.7 from 743 reviews, last updated 29 Oct 2024; reviews say search and planning are broken.
- Independent apps: BusCyprus (ads, all operators plus Nextbike, 6 languages), BusAPP.cy (planner launched 28 Sept 2026, up to 2 changes, arrive-by, saved journeys on device, no tickets, no background notifications), Cyprus Bus Guide (offline, 194 routes, no live data), Urbaneel (free, no account, live tracking), "Cyprus Transport" on the App Store (live map from official open data, offline-first, EN/EL/RU), cyprusbus.info, cybuses.com, limassolbus.online, cyprusbybus.
- Bolt operates rides, Minibus, Bolt Business, Bolt Plus and Nicosia scooters; public transport ticketing pilots inside Bolt were reported for 2026.
- Data: the Cyprus National Access Point traffic4cyprus.org.cy publishes static GTFS, GTFS-RT and SIRI real-time (update frequency "up to 1 min", maintained by the Public Works Department). Source: traffic4cyprus.org.cy/en/dataset/publictransportrealtime_siri.

### 3) Aloya today and its gaps
Strengths seen in the live test: excellent Greek and fuzzy place search ("Larnacka Airporth" resolves to Larnaca International Airport), dense trip cards with a "Why this option" rationale, Kapnos partner fares, live trip mode with Greek street names, a blunt reliability panel on route pages ("8% on time"), probabilistic stop copy ("About 25% chance one arrives before 19:55"), an honest Pulse network view, no-login posture, and a Green Line explainer. The repo also has an Expo native app (mobile/), Nextbike and Bolt scooter functions, EV chargers, Kapnos itineraries and a commute learner.

Gap matrix (Y = has it, P = partial, N = no; Aloya column from the live test and repo):

| Capability | Aloya | Pame | Moovit | Google Maps | Transit | Citymapper |
|---|---|---|---|---|---|---|
| Live arrivals Cyprus | Y | Y | Y | Y | N (not in Cyprus) | N (not in Cyprus) |
| Map that renders | N (broken in live test) | Y | Y | Y | n/a | n/a |
| Greek-first search | Y | P | P | Y | n/a | n/a |
| Confidence or reliability per ETA | Y | N | N | N | P | N |
| Smart leave-now alerts using walk time and bus position | P (leave-time adjuster uses weather and delay only) | N | P (paid) | N | Y | Y |
| Get-off alerts offline | P (alight detector in code; web only) | N | Y | N | Y | Y |
| Live trip sharing by link | P (group and eta token routes exist) | N | P (paid) | Y | Y | Y |
| Micromobility in the middle of a trip | P (Nextbike, Bolt functions; first and last mile chain) | N | P | P | Y | Y |
| Ticketing or Motion top-up | N | Y | N | N | P | N |
| Native app in stores | N (Expo app exists, not shipped) | Y | Y | Y | Y | Y |
| Offline timetables | P (bundled static GTFS) | N | P | P | Y | P |
| Accessibility routing | P (step free, shaded stops prefs) | N | P | P | P | P |

### 4) Concrete improvements
1. Fix the map first (see layer 50, issue 1). Without a map Aloya loses the head-to-head with every competitor. Effort S, impact very high.
2. Win on trust, not breadth: surface the existing freshness classifier (live, rider-confirmed, predicted, ghost, scheduled) as one consistent badge on every ETA and in notifications. Nobody else in Cyprus does this. Data: packages/core/src/freshness.ts. Effort S, impact high.
3. Steal Transit's GO crowdsourcing: when a rider is on board with GO on, publish their position as a vehicle observation for downstream riders (opt in, coarse, expiring). The repo already has rider sightings, device reputation and vehicle pings tables. Effort M, impact high on lines Pulse lists as "Busy lines we can't see".
4. Make the free tier contain what Moovit paywalls (trip sharing, arrival updates, compare routes). Effort S, impact medium.
5. Ship the Expo app to both stores (layer 49). Effort M, impact high.
6. Partner rather than fight Pame: offer a "Top up in Pame" deep link and, longer term, Motion card balance via official API if CPT opens one. Effort S then L, impact medium.
7. Publish a public comparison page ("Aloya vs official app") only with verifiable claims and dates. Effort S, impact medium.

### 5) Sources
- https://blog.transitapp.com/autogo/
- https://transitapp.com/en/features/share-live-trips
- https://nowtoronto.com/news/transit-app-update-real-time-sharing
- https://citymapper.com/news/867/share-your-eta-as-you-move
- https://moovit.com/press-releases/moovit-plus-features
- https://moovitapp.com/index/en/public_transit-Nicosia-4443
- https://www.traffic4cyprus.org.cy/en/dataset/publictransportrealtime_siri
- https://apps.apple.com/cm/app/cyprus-transport/id6787795065
- https://urbaneel.com/limassol/
- Live app test, 31 Oct 2026; repo README.md and COMMERCIAL.md (redesign-roam)

---

## Layer 42. Rewards and gamification that drive mode shift, without cheesiness

### 1) What the best in the world do
- Singapore INSINC (Stanford and LTA): shifted 7.49% of peak trips, 10.1% among heavy peak users; a "Magic Box" raffle lifted the shift to 9.34%; habits took 4+ weeks to form (from earlier research this session).
- A Singapore fare rebate randomised trial found a 5.5% pre-peak shift that persisted for 7 months (earlier research this session).
- Transportation Research Part D (2025): point incentives raised the chance of switching from car by 15%+; same-day offers worked best (earlier research).
- Counter-evidence: Nature Human Behaviour (2019) ran five commuter nudge field experiments (n = 68,915) and all failed; a 2024 Transportation Research Part F review of 49 papers finds empirical evidence still lacking; there is a documented novelty effect and familiarisation rebound; FHWA (2024) warns against rewarding behaviour that would have happened anyway (earlier research).
- ummadum: points as real money at local shops, funded by municipalities or employers, so the user is never the payer.
- Transit: "helpfulness" ranks per line for GO contributors, a reward for helping others rather than for travelling.

### 2) Reality in Cyprus
- Fares are already low and subsidised: Nicosia and Larnaca urban fares from 3 Aug 2026 are EUR 2.70 cash or EUR 2.00 with Motion by day; students 13 to 18 and university students get 50% off (earlier research). Small cash rewards therefore compete with a small price, which helps: a free ride is a large relative reward.
- Car dependence is the real problem (BRIEF). No public Cyprus mode-shift incentive programme was found in this session.

### 3) Aloya today and its gaps
No rewards or gamification surfaced in the live app. The repo has device reputation, rider sightings and "Shelter here? Yes/No" crowd prompts, which are the raw material for contribution-based recognition. There is no measure of mode shift, so any reward would currently pay for behaviour that would happen anyway.

### 4) Concrete improvements
1. Reward change, not usage. Only reward a trip when it replaces a car trip the user would plausibly have made (first ride on a new route, a peak trip shifted to shoulder time, a park-and-ride trip). Data: trip history on device, park-and-ride stops (Kolossi P3 Alphamega site, 102 spaces, from 2 Jan 2025). Effort M, impact high.
2. Sponsored, not self-funded, rewards in the ummadum model: municipalities, employers (B2B, layer 47) and shops fund points; Aloya never sells data to fund them. Effort L, impact high.
3. Same-day, raffle-style offers (INSINC "Magic Box" logic): "Leave at 07:40 instead of 08:00 today and enter tonight's draw for a monthly pass." Effort M, impact medium to high.
4. Contribution recognition instead of badges for riding: a quiet "You helped 43 riders on line 30 this week" card when GO sharing or crowd reports helped others. Effort S, impact medium.
5. A personal, private impact ledger (km by bus, money saved versus driving, CO2 avoided) with sources for each factor; no leaderboards by default. Effort S, impact medium.
6. Evaluate properly: randomise offers (A/B) and measure persistence after 4 and 12 weeks; stop anything that fades. Effort M, impact high on credibility.
7. Anti-cheesiness rules: no confetti, no streak guilt, no push notifications for rewards, opt in only, British English, Greek translations reviewed by a native speaker.

### 5) Sources
- Earlier session sources (Transportation Research Part F 2024 review; Singapore INSINC; Transportation Research Part D 2025; Nature Human Behaviour 2019; FHWA 2024); ummadum app listing.
- https://www.gov.cy/metafores-epikoinonies-erga/leitourgia-dorean-park-and-ride-sto-stadio-alfamega-sto-kolossi-anakoinonei-to-ypourgeio-metaforon-epikoinonion-kai-ergon/
- https://blog.transitapp.com/autogo/

---

## Layer 43. Social and group travel

### 1) What the best in the world do
- Citymapper: share a live ETA by WhatsApp, iMessage, Messenger, SMS or email; recipients follow on the mobile web without the app; also share stops, routes and lines.
- Transit Share Trip (1 Sept 2026): followers see the stage of the journey (walking, riding, transferring); several links can be opened together for a "GO party"; sharing is off by default and stops on arrival.
- Google Maps: "Share trip progress" stops automatically on arrival and shows the sharer's battery level; collaborative lists with emoji voting for planning outings (Nov 2023).
- Moovit+ SafeRide: designated safety contacts, behind a paywall.

### 2) Reality in Cyprus
Cypriot life is highly social and much planning happens in WhatsApp groups (inferred, no source checked). Students, tourists and event crowds travel in groups. No Cyprus transport app found offers group travel.

### 3) Aloya today and its gaps
The live app offers "Watch together, live": a no-account avatar and name picker with 15 avatars and a short code link. The repo has group/[code], eta/[token] and plan/[token] routes on both web and mobile, and D1 migrations for shared trip write keys, member mode and member avatars. Gaps: no automatic stop on arrival was verified; no battery or "stage of journey" indicator was seen; no meeting point planner ("everyone arrive at Eleftheria Square by 20:00"); invitees cannot pick their own route to a shared destination; Greek-mode strings were partly untranslated in the trip banner (layer 50, issue 5).

### 4) Concrete improvements
1. Arrive-together planner: one organiser sets a place and time; each member gets a personal plan with their own leave-by time; the group view shows who is on track. Data: existing planner plus group code. Effort M, impact high.
2. Auto-expiry and privacy defaults: links expire at arrival or after a set time, location is snapped to the route rather than raw GPS, and the sharer sees who is watching. Effort S, impact high on trust.
3. Journey stage and confidence in the shared view ("on bus 30, 6 stops, live"), reusing the freshness badge. Effort S, impact medium.
4. "Wait for me" transfer etiquette: if a member is late for a shared transfer, suggest the next common departure to everyone. Effort M, impact medium.
5. Event groups: one link for a whole fan club or class trip with headcount at boarding (layer 46). Effort M, impact medium.
6. WhatsApp-friendly Open Graph previews (dynamic OG rendering already exists) in EN and EL. Effort S, impact medium.

### 5) Sources
- https://citymapper.com/news/867/share-your-eta-as-you-move
- https://transitapp.com/en/features/share-live-trips
- https://9to5google.com/2018/10/18/google-maps-trip-sharing-android-ios/
- https://techcrunch.com/2023/11/15/google-maps-gets-more-social-feature-help-you-collaborate-with-friends/
- https://moovit.com/press-releases/moovit-plus-features
- Repo: migrations-d1/0002 to 0005, mobile/app/group/[code].tsx

---

## Layer 44. Cross-island travel: the north and the Green Line crossings

### 1) What the best in the world do
Border-aware journey planners (for example in the Schengen area before and after controls, or at Gibraltar) show crossing points, opening hours, document requirements and queue times as part of the route rather than as a separate article (general practice; no single source checked this session).

### 2) Reality in Cyprus
- Green Line Regulation 866/2004: the line is not an EU external border. Crossings: Ledra Palace and Ledra Street (pedestrian), Agios Dhometios/Metehan (the busiest; EU-funded expansion completed 13 Feb 2026, adding a traffic lane), Pergamos, Strovilia, Astromeritis-Zodhia, Kato Pyrgos-Karavostasi (Limnitis), Lefka-Apliki and Deryneia.
- No direct public bus crosses the line; travellers take a bus to Nicosia, cross on foot, and catch a northern bus or taxi (Lonely Planet). Private shuttles run from Larnaca Airport to the north (northern operators include KIBHAS); a World Bank Nicosia strategy recommends bi-communal bus routes such as airport to airport.
- Hire cars from the south are usually uninsured in the north; northern insurance is sold at most vehicle gates but not at Lefka.
- The Republic considers Ercan and the northern ports illegal points of entry; since 2019 third-country nationals arriving via the north are barred from crossing south. The Foreign Minister said on 23 Oct 2026 that crossing rules would not change under Schengen.
- 2024 crossings: 1.35M by Greek Cypriots and 1.81M by Turkish Cypriots (EU report COM(2026)324).
- Legal risk: Cyprus Law 71(I)/2013 penalises maps, including digital maps, that use place names differing from the official gazetteer (up to 3 years and/or EUR 50,000).

### 3) Aloya today and its gaps
Aloya has an honest Green Line page: "Republic buses only", "Ledra is the pedestrian crossing", and a definition of Famagusta as the Republic catchment. The planner stops at the line. Gaps: no crossing hours, no walking route to and through Ledra, no "what to bring", no north-side onward options.

### 4) Concrete improvements
1. Crossing-aware routing to the line: plan to the nearest suitable crossing for a destination north of the line, with walking time, pedestrian or vehicle status and documents. Data: a hand-maintained crossings table with hours, reviewed monthly. Effort M, impact medium.
2. Naming policy: label northern places with the official gazetteer name first, and show any other name only as a secondary search alias, to stay within Law 71(I)/2013. Get a written legal opinion before launch. Effort S, impact high on legal risk.
3. Third-country national warning: if the user's arrival airport is Ercan, show the Republic's entry rule before suggesting any southbound route. Effort S, impact high on harm avoidance.
4. Car hire insurance note on any vehicle crossing route. Effort S, impact medium.
5. Do not ingest northern operator timetables until the naming and legal review is done; then consider partnerships with northern operators for information only. Effort L, impact medium.

### 5) Sources
- https://cyprus.representation.ec.europa.eu/news/eu-funded-works-completed-agios-dhometiosmetehan-crossing-2026-02-13_en
- https://www.lonelyplanet.com/articles/getting-around-cyprus
- https://documents1.worldbank.org/curated/en/854931621588525204/pdf/Final-Strategy-and-Recommendations.pdf
- https://aloya.cy/green-line
- Earlier session sources: Regulation 866/2004; US travel advisory (13 Aug 2026); COM(2026)324; Law 71(I)/2013

---

## Layer 45. Families: school children, parent tracking, students

### 1) What the best in the world do
- Transit Share Trip is explicitly promoted for students travelling to school alone; it stops sharing on arrival.
- Life360 is the cautionary tale: The Markup (Dec 2021) found it sold precise location data on tens of millions of users, including children, to about a dozen brokers; location sales were USD 16M, nearly 20% of 2020 revenue; it then stopped selling precise data except to Arity and moved to aggregated sales.

### 2) Reality in Cyprus
- School bus: EUR 5 per month or EUR 30 per year with a personalised Motion card (Sept 2025 to Aug 2027, EUR 17 per month subsidy); free for large families and guaranteed minimum income recipients; from 14 Sept 2026 pupils without a card cannot board. Children under 6 ride free; ages 6 to 12 get 50% off regular buses; under 12s ride school buses free (earlier research this session).
- GDPR in Cyprus: Law 125(I)/2018 article 8 sets the digital age of consent at 14; below 14 a parent must give or authorise consent. A draft bill would raise it to 16 (Lex Mundi guide).
- The Commissioner's DPIA guidance lists location tracking by mobile apps as a high-risk processing example.

### 3) Aloya today and its gaps
No family or student mode. School routes and student fares were not seen in the planner. The generic watch-together link could be used by parents, but without consent controls suited to minors.

### 4) Concrete improvements
1. "Arrived safely" mode: the child starts a trip, the parent gets three events only (boarded, transfer made, arrived), never a continuous dot. Data: alight detector and journey phases. Effort M, impact high.
2. Consent by design: users under 14 cannot enable sharing without a parent's authorisation; the child always sees when sharing is on; no history kept after 24 hours. Effort M, impact high on compliance.
3. Student fare awareness: show the 50% student fare and school bus card status in fare estimates when the user sets "student". Effort S, impact medium.
4. School run planner for parents: compare driving with school bus plus walk, in time and money. Effort M, impact medium on car trips.
5. Never monetise children's location; write that into the privacy policy and B2B contracts. Effort S, impact high on trust.
6. Run a DPIA before shipping any tracking feature. Effort S, impact high.

### 5) Sources
- https://themarkup.org/privacy/2021/12/06/the-popular-family-safety-app-life360-is-selling-precise-location-data-on-its-tens-of-millions-of-user
- https://themarkup.org/privacy/2022/04/01/following-markup-investigation-u-s-regulators-questioned-life360s-data-practices
- https://www.cylaw.org/nomoi/enop/ind/2018_1_125/section-sc37ee18bb-ce6a-46ae-9441-b2ce6c435b56.html
- https://www.lexmundi.com/guides/global-data-privacy-guide/jurisdictions/europe/cyprus/
- https://www.dataprotection.gov.cy/dataprotection/dataprotection.nsf/page2b_en/page2b_en?opendocument
- https://nowtoronto.com/news/transit-app-update-real-time-sharing

---

## Layer 46. Events, stadiums, festivals and surge handling

### 1) What the best in the world do
Event-aware planners publish special event timetables in advance, route people to park-and-ride, and stagger departures after the final whistle (general practice in large networks; no single source checked this session).

### 2) Reality in Cyprus
- Limassol Wine Festival: the Deputy Ministry of Tourism ran free pre-booked coaches from Nicosia, Larnaca, Ayia Napa and Paphos (2024 dates and times published by Limassol municipality). In 2022 the municipality made EMEL line 30 free to the festival.
- Limassol Carnival: Intercity Buses ran additional routes on 2 Mar 2025 and published route diversions for carnival events in Feb 2026.
- Kataklysmos 2026, Larnaca: a special express park and ride from GSZ Stadium to the central bus station, every 30 minutes, 18:00 to 00:30 on 31 May and 1 Jun 2026.
- Nicosia: Express route X200 (from 2 Jun 2025) links Tamasos station, GSP Stadium, the General Hospital and the University of Cyprus.
- Visit Cyprus publishes an annual events PDF (2026 edition dated 6 Oct 2026).
- These are published as PDFs and Facebook posts, not as GTFS changes (inferred from the formats found).

### 3) Aloya today and its gaps
Pulse showed an editorial card "Matchnight in Larnaca. Expect Antonis Papadopoulos Stadium traffic from 17:30. Routes 407 run heavy." with no date and no source (layer 50, issue 9). There is no structured event calendar, no special service ingestion, and no post-event crowd guidance.

### 4) Concrete improvements
1. Event calendar ingestion: fixtures (Cyprus league), the Visit Cyprus events PDF and municipal festivals into a dated events table with venue coordinates. Effort M, impact medium.
2. Special service ingestion: turn operator PDFs (Kataklysmos park and ride, carnival extras, festival coaches) into temporary GTFS trips that the planner can route on. Effort M, impact high on event nights.
3. Every event card carries a date, a source link and an expiry, and disappears afterwards. Effort S, impact high on trust.
4. Post-event guidance: after the final whistle, recommend walking to a quieter stop 5 to 10 minutes away or waiting 20 minutes, using live vehicle load where available and crowd reports otherwise. Effort M, impact medium.
5. Park and ride first: when the destination is a stadium or festival, rank park and ride options (Kolossi, GSZ) above driving to the venue. Effort S, impact medium on car trips.
6. Offer municipalities and clubs a white-label event page (B2G and B2B, layer 47). Effort M, impact medium.

### 5) Sources
- https://www.limassol.org.cy/en/wine-festival-transportation
- https://cyprus-mail.com/2022/09/17/free-transport-for-limassol-wine-festival-visitors
- https://intercity-buses.com/en/ (additional routes to Limassol Carnival, 26 Feb 2025)
- http://production.larnakaregion.com.dedi3501.your-server.de/storage/app/media/EVENT%20DIARY/park-and-ride-kataklysmos-2026-kataklysmos-2026-special-park-ride-service.pdf
- https://publictransport.com.cy/cms/page/express-route-x200
- https://www.visitcyprus.com/wp-content/uploads/2026/10/ANNUAL_EVENTS_16_2026.pdf
- Live app test, Pulse tab, 31 Oct 2026
---

## Layer 47. Business models: B2C, B2B, B2G, affiliate and data, including what failed elsewhere

### 1) What the best in the world do, and what failed
- B2C subscription failed at scale: MaaS Global (Whim) raised over EUR 160M (Sifted), had about 10,000 active users in Helsinki and 1 million users overall, lost EUR 9.3M on EUR 3.8M revenue in 2022, cut staff from 120 to 28, and filed for bankruptcy in March 2024; commentators blamed the B2C subscription bundle. umob bought the assets.
- Citymapper made Club features free in version 11 after launching Club at USD 2.99 per month, and was acquired by Via.
- What works: Transit's Royale is sponsored by more than 150 agencies for all their riders (B2G pays, rider gets it free); Moovit sells white-label apps, analytics and advertising to governments and was bought by Intel/Mobileye for about USD 900M in 2020; TNO and Cutter describe a shift from B2C MaaS to government-led "public mobility".
- Data sales are a reputational trap: Life360 earned USD 16M from location sales in 2020 and was forced to retreat after The Markup's reporting; Strava's 2018 global heatmap revealed military bases.

### 2) Reality in Cyprus
- Small market: Pame claims 8K+ active users. Fares are low, so a rider subscription has little headroom.
- Buyers exist: the Ministry and CPT (official app rated about 2 to 3 stars), five regional operators, municipalities, employers with parking problems, hotels and tourist businesses, Hermes Airports, and partners such as Kapnos, Nextbike and Bolt.
- Cyprus hosts the British Sovereign Base Areas (Akrotiri and Dhekelia); any aggregated movement map must avoid Strava-type disclosures (inferred risk).

### 3) Aloya today and its gaps
COMMERCIAL.md describes licensing options (single deployment, source available, full asset transfer) and still calls the code proprietary, while it was made public and MIT licensed in Oct 2026 (from memory notes). README lists Stripe billing for "Aloya Pro". The Expo config asks iOS for App Tracking Transparency "to measure which features help Cyprus riders", which is unnecessary for first-party analytics and a trust risk. The Pass tab shows a 7 day pass price with no way to buy (layer 50, issue 20).

### 4) Concrete improvements
1. Keep the rider app free; do not lead with a B2C subscription (Whim lesson). Effort S, impact high.
2. B2G: offer the trust layer (freshness, reliability, ghost bus detection, ETA backtesting) as an operator dashboard and an accuracy audit for CPT and the Ministry, priced per month. Data: existing eta_accuracy, truth_ledger and ghost-trips code. Effort M, impact high.
3. B2B commuter programmes: employers fund passes and rewards (layer 42) and get anonymised commute reports for parking and ESG. Effort M, impact medium to high.
4. Affiliate with clear labels: Kapnos booking, Bolt rides, Nextbike, car hire with north insurance notes; disclose "Aloya may earn a commission". Effort S, impact medium.
5. Data products only as aggregated, k-anonymous, delayed statistics with exclusion zones around military and sensitive sites; never raw traces; never children's data. Effort M, impact medium, risk managed.
6. Fix the licence story: one licence in LICENSE, README and COMMERCIAL.md. Effort S, impact high on credibility.
7. Remove the ATT prompt unless cross-app tracking is truly needed. Effort S, impact medium on trust and review.
8. Grants: EU and Cyprus innovation funds for sustainable mobility as non-dilutive income (not researched in depth this session).

### 5) Sources
- https://www.fleeteurope.com/en/maas/europe/features/umob-acquires-bankrupt-maas-global
- https://m2050.media/en/maas-global-whim-files-for-bankruptcy-a-turning-point-for-the-sector/
- https://sifted.eu/articles/maas-whim-bankrupt-news
- https://www.globalfleet.com/en/maas/europe/analysis/maas-10-dead-say-hello-public-mobility
- https://www.cutter.com/article/maas-delivering-its-promise-pragmatic-insights-perspectives
- https://themarkup.org/privacy/2022/04/01/following-markup-investigation-u-s-regulators-questioned-life360s-data-practices
- https://www.theguardian.com/world/2018/jan/28/fitness-tracking-app-gives-away-location-of-secret-us-army-bases
- https://moovit.com/press-releases/moovit-plus-launch-business-strategy
- Repo: COMMERCIAL.md, README.md, mobile/app.json (redesign-roam)

---

## Layer 48. Standards and regulation: ITS Directive revision, MMTIS, Cyprus NAP, EAA 2025 and GDPR

### 1) What the rules say
- ITS Directive revision, Directive (EU) 2023/2661: Member States had to transpose it by 21 Dec 2025; a new Article 6a makes data in Annex III available for set coverage and dates.
- MMTIS Delegated Regulation (EU) 2024/490, amending 2017/1926: dynamic data via National Access Points becomes mandatory on a timeline from 1 Dec 2025 to 1 Dec 2028 (points 2.1 and 2.2 of the Annex: comprehensive TEN-T by 1 Dec 2025 and 1 Dec 2026, the rest of the network by 1 Dec 2028); NeTEx is required for scheduled timetables; the regulation only covers data that already exists in digital form.
- European Accessibility Act, Directive 2019/882, transposed in Cyprus by Law 57(I)/2024 (published 2 May 2024), applies from 28 Jun 2025 to websites, mobile apps, e-tickets and real-time information of bus, air, rail and water passenger services. Micro-enterprises providing services (fewer than 10 staff and turnover or balance sheet up to EUR 2M) are exempt.
- GDPR plus Cyprus Law 125(I)/2018: digital age of consent 14. EDPB Guidelines 01/2020 on connected vehicles and mobility apps recommend local processing and treat location data as warranting special attention. Cyprus's DPIA list was criticised by the EDPB (Opinion 10/2019) for not naming location data; the Commissioner's guidance nonetheless gives location tracking by apps as an example of high-risk processing.

### 2) Reality in Cyprus
- The NAP traffic4cyprus.org.cy publishes GTFS static, GTFS-RT and SIRI real-time for all public bus operators, plus Bolt scooter stations (earlier research).
- Aloya consumes, rather than publishes, these feeds, so most MMTIS duties fall on data holders. Aloya's obligations are attribution, licence compliance and, if it ever holds dynamic data of its own (for example Kapnos or crowd data), possibly publishing metadata to the NAP.

### 3) Aloya today and its gaps
- EAA: Aloya is likely exempt as a micro-enterprise (inferred), but CPT and operators are not; a compliant Aloya is a sales argument in B2G. Live test found likely contrast failures, no dark mode and some unlabelled states (layer 50).
- Map imagery: src/lib/basemap.ts ships Esri World Imagery, which its own comment says is "NOT licensed for production use without an Esri/ArcGIS agreement".
- GDPR: no DPIA found in the repo; ATT prompt in the iOS config; background location declared for "on-trip alerts".

### 4) Concrete improvements
1. Accessibility conformance to EN 301 549 / WCAG 2.2 AA anyway, with an accessibility statement in EN and EL. Effort M, impact high.
2. NeTEx readiness: add a NeTEx import path alongside GTFS so Aloya keeps working if Cyprus publishes NeTEx first. Effort M, impact medium.
3. Licence hygiene: switch the basemap to the licensed Mapbox satellite or light style already configured, or sign an Esri agreement; keep the attribution component. Effort S, impact high on legal risk.
4. DPIA and records of processing for location, crowd reports, group sharing and children's use; publish a short summary. Effort S, impact high.
5. Data minimisation: snap shared positions to the route, keep raw traces on device, expire group data within 24 hours. Effort M, impact high.
6. Register Aloya's own dynamic data (crowd confirmations) on the NAP as an open dataset once quality is proven; this positions Aloya as a data partner. Effort M, impact medium.

### 5) Sources
- https://eur-lex.europa.eu/eli/dir/2023/2661/oj/eng
- https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R0490
- https://transport.ec.europa.eu/document/download/0b75db16-35b1-41df-8229-5c8abfec534d_en?filename=MMTIS_implementation_handbook.pdf
- https://napcore.eu/wp-content/uploads/2025/04/NAPCORE-WG5_Communication-Package_FAQs-on-the-Delegated-Regulations.pdf
- https://cylaw.org/nomoi/enop/ind/2024_1_57/section-sc88225479-c440-4671-85a0-29cbe8122fbb.html
- https://conformahq.com/european-accessibility-act/cyprus
- https://eur-lex.europa.eu/EN/legal-content/summary/accessibility-of-products-and-services.html
- https://www.edpb.europa.eu/system/files/documents/2021-03/edpb_guidelines_202001_connected_vehicles_v2.0_adopted_en.pdf
- https://dataprotection.ro/servlet/ViewDocument?id=1742
- https://www.cylaw.org/nomoi/enop/ind/2018_1_125/section-sc37ee18bb-ce6a-46ae-9441-b2ce6c435b56.html
- Repo: src/lib/basemap.ts (redesign-roam)

---

## Layer 49. PWA versus native: Capacitor or Expo, push, Live Activities, background location, and what smart alerts need

### 1) What the platforms allow
- iOS web push works only for web apps added to the Home Screen (iOS 16.4+); Declarative Web Push arrived in iOS and iPadOS 18.4 and needs no service worker; there is no Background Sync, Periodic Background Sync or Background Fetch on iOS PWAs (firt.dev compatibility table, 13 Oct 2026). From iOS 26, sites added to the Home Screen open as web apps by default.
- No PWA on any platform can watch location in the background, so a PWA cannot know that the rider has left home and is walking to the stop while the screen is off.
- Native: iOS region monitoring is capped at 20 regions per app; Android geofencing at 100 per app and needs ACCESS_BACKGROUND_LOCATION from Android 10. Google Play requires a declaration form, a prominent in-app disclosure and a video for background location, which must be core functionality.
- Live Activities need a Widget Extension with ActivityKit, iOS 16.1+; installing a Capacitor plugin alone does not create one.
- Capacitor's own geolocation plugin does not support background location; community and commercial plugins do (capacitor-community/background-geolocation, Transistorsoft, Capawesome, Capgo). Wrappers risk App Store guideline 4.2 rejection if they feel like a repackaged website.

### 2) Reality for Aloya
The repo already contains an Expo / React Native app that mirrors the web routes one to one, shares packages/core, and declares UIBackgroundModes location and remote-notification, NSSupportsLiveActivities, Android background location, notifications and boot permissions, deep links for /group, /plan and /eta, and EAS build profiles. This is a real native peer, not a wrapper, so the Capacitor question is mostly settled: Expo is the right path.

### 3) Aloya today and its gaps
- Samuel's main complaint (alerts fire as if he is already at the stop) cannot be fully solved on the PWA because the web cannot track him in the background.
- src/lib/leave-time-adjuster.ts only shifts reminders for weather (Open-Meteo) and recent route delay; it does not use the rider's live position, walking time or the live position of the specific vehicle.
- The live PWA's /manifest.json returned the SPA 404 page and no install prompt was seen (layer 50, issue 4).
- NSSupportsLiveActivities is set, but no Widget Extension was found in mobile/ (inferred from the file tree; needs confirming).

### 4) Concrete improvements
1. Smart alert engine (server plus device): alert only when slack = (vehicle ETA at stop) minus (walking time from current position) crosses thresholds; examples: slack under 2 min means "Hurry, you'll miss it, next one in 18 min"; slack negative means "You'll miss this one. Walk 4 min to stop X for line 30 in 6 min." Inputs: device location (native background, or foreground on web), walking time from the routing engine, vehicle ETA from GTFS-RT with its confidence tier. Effort M, impact very high.
2. State machine per leg (at home, walking, at stop, on board, approaching transfer, transferring, arrived) so alerts fit the phase; suppress "at stop" alerts until the device is within about 50 m of the stop. Effort M, impact very high.
3. Native first for alerts: ship the Expo app with region monitoring of the next 1 to 3 stops only (well under the 20 and 100 limits), significant location change otherwise, and silent push to refresh. Effort M, impact very high.
4. Live Activity and Android ongoing notification showing "Leave in 3 min / Bus 30 in 7 min / live". Effort M, impact high.
5. PWA fallback: fix the manifest, add Declarative Web Push for iOS 18.4+, and be honest in the UI that alerts work best with the app open or with the native app. Effort S, impact medium.
6. Play and App Store compliance pack: background location disclosure text in EN and EL, video, privacy policy link; remove the ATT prompt. Effort S, impact high on approval.

### 5) Sources
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://webkit.org/blog/16535/meet-declarative-web-push/
- https://firt.dev/notes/pwa-ios
- https://developer.android.com/develop/sensors-and-location/location/geofencing
- https://support.google.com/googleplay/android-developer/answer/9799150
- https://radar.com/blog/limitations-of-ios-geofencing
- https://capacitorjs.com/docs/apis/geolocation
- https://capgo.app/plugins/capacitor-live-activities/
- https://developer.apple.com/app-store/review/guidelines
- Repo: mobile/app.json, src/lib/leave-time-adjuster.ts (redesign-roam)
---

## Layer 50. QA: scenario catalogue, Playwright automation and a live hands-on pass

### 1) What the best do
Teams test time and place deterministically: Playwright's context geolocation and permissions, page.clock (setFixedTime, install, pauseAt, fastForward, runFor), context.setOffline, and network mocking with page.route. Note: setOffline cuts the service worker only in Chromium, so offline tests should also drop connections at the test server for WebKit and Firefox.

### 2) Test harness (Playwright, TypeScript)

    // tests/e2e/fixtures.ts
    import { test as base, expect } from '@playwright/test';
    export const NICOSIA = { latitude: 35.1725, longitude: 33.3617 };
    export const test = base.extend<{ at: (lat:number, lng:number)=>Promise<void> }>({
      at: async ({ context }, use) => {
        await context.grantPermissions(['geolocation']);
        await use(async (latitude, longitude) => context.setGeolocation({ latitude, longitude }));
      },
    });
    export async function freezeClock(page, iso: string) {
      await page.clock.install({ time: new Date(iso) }); // before page.goto
    }
    export async function mockRealtime(page, body: unknown) {
      await page.route('**/api/public/realtime**', r => r.fulfill({ json: body }));
    }

    // playwright.config.ts (excerpt)
    // use: { timezoneId: 'Asia/Nicosia', locale: 'en-GB', viewport: { width: 390, height: 844 } }
    // projects: chromium-mobile, webkit-mobile, chromium-desktop, el-GR locale

Example: home, walking 10 min, bus 5 min away (the core smart-alert case).

    test('home: walk 10 min, bus 5 min, warns rider will miss it', async ({ page, at }) => {
      await freezeClock(page, '2026-11-02T07:50:00+02:00');
      await at(35.1650, 33.3550);                     // home, about 800 m from stop
      await mockRealtime(page, fixtures.bus30EtaSeconds(300, 'live'));
      await page.goto('/trip/fixture-home-to-work');
      await page.getByRole('button', { name: /start this trip/i }).click();
      await expect(page.getByText(/you're 10 min away/i)).toBeVisible();
      await expect(page.getByText(/bus .* 5 min/i)).toBeVisible();
      await expect(page.getByText(/next one|walk to/i)).toBeVisible(); // offers alternative
      await expect(page.getByText(/at your stop/i)).toHaveCount(0);    // no false "at stop"
    });

Example: dead GPS.

    test('dead GPS: graceful fallback, no stuck loader', async ({ page, context }) => {
      await context.clearPermissions();
      await page.goto('/');
      await expect(page.getByText(/search for (a stop|the address)/i)).toBeVisible();
      await expect(page.getByText(/finding stops near you/i)).toHaveCount(0);
    });
### 3) Scenario catalogue (expected behaviour; automation: G = setGeolocation, C = clock, R = route mock of realtime or planner, O = offline, L = locale, V = viewport)

| # | Scenario | Expected behaviour | Auto |
|---|---|---|---|
| 1 | Home, walking 10 min, bus 5 min away | Warns rider will miss it; offers next bus or alternative stop; never says "at your stop" | G C R |
| 2 | Home, walking 5 min, bus 12 min | "Leave in 7 min" countdown; single alert at leave time | G C R |
| 3 | Home, walking 5 min, bus 6 min | "Leave now" alert once | G C R |
| 4 | At stop, bus 3 min live | "Bus in 3 min, live" | G C R |
| 5 | At stop, bus predicted only | Shows predicted tier, not live | G C R |
| 6 | At stop, ghost bus (scheduled, no vehicle) | Ghost label and next reliable option | G C R |
| 7 | Dead GPS (permission denied) | Typed search fallback; no stuck loader | G |
| 8 | GPS timeout | Error after timeout with retry and search | G R |
| 9 | GPS accuracy 500 m | Shows "approximate location", widens stop radius | G |
| 10 | GPS jumps 2 km (spoof or glitch) | Ignores outlier, no alert storm | G C |
| 11 | Late bus, delay grows from 2 to 9 min | Updates countdown; one "running late" alert, not one per poll | C R |
| 12 | Late bus makes transfer impossible | Proposes new connection before alighting | C R |
| 13 | Missed transfer (rider still on first bus past transfer stop) | Detects, re-plans from current position | G C R |
| 14 | Missed bus at stop (vehicle passed) | "Bus left", next departure and alternatives | G C R |
| 15 | Bus early by 2 min | Warns when slack shrinks; on-time definition respected | C R |
| 16 | Bus cancelled (trip removed from feed) | Cancellation notice, alternatives | C R |
| 17 | Feed down (realtime 500) | Falls back to schedule with clear label | R |
| 18 | Feed stale (timestamp 10 min old) | Marks data stale; no live badge | C R |
| 19 | Airport at night (LCA, 01:30) | Night options (Kapnos, night fare) or honest "no bus until 05:xx", taxi suggestion | C R |
| 20 | Airport arrival with delayed flight | Re-plans from landing time | C R |
| 21 | Tourist offline (airplane mode after load) | Cached timetables and saved trip usable; offline banner | O |
| 22 | Tourist offline, cold start | Shell loads from service worker or explains offline | O |
| 23 | Back online after offline | Refreshes live data, removes banner | O R |
| 24 | Greek UI, all tabs | No English strings left (Trip In Progress banner) | L |
| 25 | Greek search "Πλατεία Ελευθερίας" | Relevant results | R |
| 26 | Accentless Greek search | Same results as accented | R |
| 27 | Greeklish search "Plateia Eleftherias" | Relevant results | R |
| 28 | Misspelt place | Fuzzy top hit | R |
| 29 | Nonsense query | "No places found" empty state | R |
| 30 | Empty submit | Disabled or inline validation | - |
| 31 | Same origin and destination | Friendly message | R |
| 32 | Destination north of the Green Line | Route to crossing, naming policy respected | R |
| 33 | Destination unreachable by bus | Walk, bike, taxi options, honest message | R |
| 34 | Arrive by 08:30 | Latest departure that arrives on time | C R |
| 35 | Leave at 23:50 crossing midnight | Correct next-day service dates | C R |
| 36 | Sunday or holiday timetable | Uses correct calendar | C R |
| 37 | DST change (last Sunday of October) | Times correct across the change | C |
| 38 | Daylight-saving spring forward | No duplicate or missing departures | C |
| 39 | Step-free preference | Avoids non-accessible stops where known | R |
| 40 | Short walks preference | Caps walking distance | R |
| 41 | Shaded stops preference in summer | Ranks shaded stops | R |
| 42 | Scooter in middle of trip | Offers bus, scooter, bus chain when faster | R |
| 43 | Nextbike dock empty | Excludes or warns | R |
| 44 | Better stop across the road with more frequent line | Suggested with walk time | G R |
| 45 | Trip in progress, app backgrounded and resumed | Restores state | C |
| 46 | End trip | Clears banner on all tabs | - |
| 47 | Start second trip while one active | Asks to replace | - |
| 48 | Alight alert two stops before | Fires once at the right stop | G C R |
| 49 | Alight alert offline | Still fires from cached stop list | G O |
| 50 | Group link opened by a non-user | Read-only live view in browser | - |
| 51 | Group link after arrival | Expired message | C |
| 52 | Group with 10 members | Performance acceptable, no overlap | R |
| 53 | Share link preview (Open Graph) | Correct title and image in EN and EL | R |
| 54 | Deep link reload on every tab URL | Renders correct tab | - |
| 55 | Unknown route 404 | Branded 404 with Go home | - |
| 56 | Browser back from trip results | Returns to planner | - |
| 57 | Narrow phone 360 px | No overflow | V |
| 58 | Large text (200%) | Layout holds | V |
| 59 | Desktop 1440 px | Usable layout or declared mobile design | V |
| 60 | Keyboard-only navigation | All controls reachable with visible focus | - |
| 61 | Screen reader labels on icon buttons | Every icon button has a name | - |
| 62 | Colour contrast | WCAG AA on labels and tabs | - |
| 63 | Reduced motion | No essential animation | V |
| 64 | Dark mode system preference | Respects it or documents light only | V |
| 65 | Map tiles fail | Clear fallback, rest of page usable, retry works | R |
| 66 | Map tiles succeed | Map renders on all map pages | - |
| 67 | Pulse numbers | Show "as of HH:MM" | C R |
| 68 | Pulse editorial card past expiry | Hidden | C |
| 69 | Event night card | Dated, sourced | C R |
| 70 | Weather heavy rain | Leave-time buffer applied with reason | R |
| 71 | Open-Meteo down | No crash, no buffer | R |
| 72 | Pass: camera unavailable | Friendly message, manual entry | - |
| 73 | Pass: invalid card date | Validation message | - |
| 74 | Pass: 7 day pass row | Either buy path or no implied product | - |
| 75 | Saved home, no GPS | Next bus near home works | R |
| 76 | Remove saved home | Removed everywhere | - |
| 77 | Clear site data | App starts clean, no errors | - |
| 78 | Slow 3G | Skeletons, no layout jump, under 5 s to useful content | R |
| 79 | API returns malformed JSON | Error state, no white screen | R |
| 80 | Rate limited (429) | Back-off and message | R |
| 81 | Push permission denied | In-app alerts still work | - |
| 82 | Push received while on another tab | Opens the right trip | - |
| 83 | Clock skew on device (5 min fast) | Server time used for countdowns | C R |
| 84 | Timezone not Asia/Nicosia (tourist phone on UK time) | Shows Cyprus local times, labelled | C L |
| 85 | Long route names and Greek headsigns | No truncation of key info | V |
| 86 | Kapnos partner link | Opens Kapnos, labelled as leaving Aloya | - |
| 87 | Getting around Cyprus link | Labelled cross-domain or in-app | - |
| 88 | Service worker update | New version prompt, no stale shell | - |
| 89 | Manifest and install | Valid manifest, installable | - |
| 90 | Privacy: location never sent when sharing off | No location in network log | G R |
### 4) Live hands-on QA pass (31 Oct 2026, 19:34 EET, desktop browser about 1920 px, no sign-in)

| # | Issue | Severity |
|---|---|---|
| 1 | Map never loads on any page that embeds one (Now, trip results, trip guidance, Lines, Pulse, route, stop, airport); "Try again" does not recover. The code ships Esri raster tiles (src/lib/basemap.ts); root cause not confirmed from the UI | Critical |
| 2 | "Finding stops near you" stays as plain text when location is denied; reads as stuck | Medium |
| 3 | Fixed mobile column about 408 to 430 px on desktop, no responsive layout | Medium |
| 4 | /manifest.json returns the SPA 404 page; no install prompt seen | Medium |
| 5 | Greek mode leaves "Trip In Progress" and "End Trip" in English in the top banner | Medium |
| 6 | "Getting around Cyprus" silently leaves the app for aloya.cy with a separate cookie banner | Medium |
| 7 | Pulse headline numbers have no "as of" time | Low |
| 8 | "Busy lines we can't see" copy is unclear ("Almost no rider phones") | Low |
| 9 | "Matchnight in Larnaca" card has no date and no source | Low |
| 10 | Pass scanner shows raw "Camera unavailable. Requested device not found." | Low |
| 11 | Zero-result search shows no empty state | Low |
| 12 | Motion trip cards show no fare (only Kapnos does) | Low |
| 13 | "op N min" on stop pages is unexplained | Low |
| 14 | Pulse numbers change between loads with no live cue | Low |
| 15 | Likely WCAG AA contrast failures on small grey labels, radio outlines, inactive tabs | Low (Medium for EAA sales) |
| 16 | No dark mode or appearance setting | Low |
| 17 | Leave and Arrive by controls not exercised (untested) | Low |
| 18 | Browser Back from /trips stayed on /trips (needs controlled check) | Low |
| 19 | Trip in progress banner on every tab with no per-tab dismiss (design choice) | Low |
| 20 | Pass shows a 7 day personalised pass at EUR 33.40 with no way to buy | Low |
| 21 | Pulse highlight on Famagusta has no legend | Low |
| 22 | Direct sort pill not verified | Low |

Repo-level findings (from reading redesign-roam): Esri imagery not licensed for production (basemap.ts comment); LICENSE, README and COMMERCIAL.md say proprietary while the repo was made public and MIT licensed in Oct 2026 (from memory notes; confirm); iOS ATT prompt declared in mobile/app.json; leave-time adjuster ignores rider position and vehicle position.

What works well: Greek and fuzzy search; dense trip cards with "Why this option"; live trip mode with countdown and turn-by-turn walking; watch together with no account; graceful location denial with typed fallback and a saved home that powers "Next bus near here"; transparent reliability and probability copy; EN and EL switch across the tab bar; branded 404; visible keyboard focus; End trip clears state.

### 5) Sources
- https://playwright.dev/docs/emulation
- https://playwright.dev/docs/clock
- https://playwright.dev/docs/api/class-clock
- https://progressivewebapps.com/testing/automated-testing/
- Live app QA pass, 31 Oct 2026 19:34 EET (browser session aloya-qa)
- Repo files: src/lib/basemap.ts, src/lib/leave-time-adjuster.ts, mobile/app.json, COMMERCIAL.md

---

## Part E summary: top 10 improvements

1. Fix the map on every page and move to a production-licensed basemap (Critical, S).
2. Build the smart alert engine: slack = vehicle ETA minus walking time from the live position, with a per-leg state machine; no "at stop" alerts until near the stop (S to M, very high impact; answers Samuel's core complaint).
3. Ship the Expo native app with background region monitoring of the next stops, a Live Activity and silent push (M).
4. Show one freshness and confidence badge on every ETA and alert (S).
5. GO-style opt-in crowdsourced vehicle positions for lines with poor feed coverage (M).
6. Arrive-together group planner with auto-expiring, route-snapped sharing and a child-safe "arrived" mode under the Cyprus age-14 consent rule (M).
7. Event layer: dated, sourced event cards; special services from operator PDFs as temporary trips; park and ride first (M).
8. Business model: free rider app; B2G trust and accuracy dashboard; employer-funded commuter programmes and rewards for real mode change; no raw data sales (M to L).
9. Compliance pack: WCAG 2.2 AA and an accessibility statement, DPIA, remove ATT, unify the licence, Green Line naming policy (S to M).
10. PWA hygiene: valid manifest, Declarative Web Push, Greek strings complete, empty states, "as of" stamps, fares on every card (S).

## Top QA issues
1. Critical: map does not load anywhere.
2. Medium: missing manifest and install path.
3. Medium: stuck-looking "Finding stops near you" when location is denied.
4. Medium: untranslated Greek strings in the trip banner.
5. Medium: silent cross-domain jump to aloya.cy.
6. Medium: no desktop layout.
7. Repo: unlicensed Esri imagery in production code; ATT prompt; licence mismatch.

END OF PART E
