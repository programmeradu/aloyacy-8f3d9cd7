# Part C: Integrations, partners and the open platform (layers 21 to 30)

Aloya 50-layer smart mobility research. Part C covers everything outside the bus feed that Aloya plugs into, and everything that might one day plug into Aloya: the economics of Mobility as a Service, micromobility, taxis and ride-hail, ticketing and payments, Aloya as a platform for others, the competitive field (Google, Apple, Moovit, Transitous and local apps), cars and parking, tourism, employers and universities, and government, EU law and open data.

Samuel's vision for this part, from the brief: Aloya is not a bus app. It is a smart mobility platform for Cyprus that integrates many partners and is open for others to integrate it. Part C tests that vision against the code as it stands and against what partners, regulators and competitors actually allow.

Code references point at repo programmeradu/aloyacy-8f3d9cd7, branch redesign-roam, commit 1508f3f (full sha 1508f3ff4f387f758369bcb7f996d0f4658e4261, checked 31 Oct 2026). The branch was read only; nothing was changed on it.

A note on sources. Facts marked "earlier research pass" come from the raw findings file part-c-raw.md, written by an earlier run whose report did not carry its URLs. They were not re-opened in this pass and should be re-checked before anyone relies on them in public. Everything else carries the URL that was opened or searched in this pass.

## Five things that need fixing before any partner conversation

1. **JCC Smart login with user passwords and spoofed browser headers.** src/lib/jcc.functions.ts sends the rider's JCC Smart email and password from Aloya's server to apihub.jcc.com.cy (lines 44 to 59), sets origin and referer to https://www.jccsmart.com/ and a desktop Safari user agent (lines 11 to 18) so the request "looks like a normal browser session" (comment, lines 20 to 21), then reads the card's last 30 transactions (lines 168 to 183). The file's own header says it exists because "apihub.jcc.com.cy locks CORS to jccsmart.com" (lines 2 to 3). The same logic is copied into a public, unauthenticated CORS endpoint, src/routes/api/public/wallet.ts (headers at lines 18 to 26, CORS `*` at lines 35 to 40), which also sends a spoofed referer to publictransport.com.cy (lines 28 to 33). No agreement with JCC is recorded anywhere in the repo. This is the single largest legal and trust risk in the product.
2. **The licence says proprietary.** LICENSE is titled "Aloya, Proprietary Software License" and grants no licence beyond evaluation (sections 2 and 3); README.md line 258 says "Proprietary, all rights reserved"; COMMERCIAL.md describes single-deployment, source-available and full asset transfer grants. Memory from earlier sessions recorded the project as MIT. A platform that wants others to integrate it cannot be ambiguous about this.
3. **About 60 open public routes.** Of the 63 route files under src/routes/api/public that are not cron hooks or Open Graph images, 59 send `Access-Control-Allow-Origin: *`. None needs an API key. The only throttles are per-device checks keyed on a device id the caller supplies (sighting.ts line 14 and 90, stop-photo.server.ts lines 100 to 110), which a script can vary at will. Paid upstreams sit behind some of them: ElevenLabs and OpenAI text to speech (tts.ts), OpenAI speech to text (stt.ts), Gemini (wallet/ocr.ts line 121 to 136, and parse-trip-intent.ts via src/lib/ai-planner.functions.ts line 55), and Mapbox Search Box, which src/lib/maps.server.ts lines 7 to 8 note is "billed per request" (places-autocomplete.ts). The brief called these "Google" endpoints; at 1508f3f the maps backend is Mapbox, not Google Maps (maps.server.ts lines 1 to 5 say Google Places, Geocoding and Routes were replaced in Oct 2026 after the Google Cloud account suspension), while Gemini is still Google. .env.example lines 21 to 28 still document Google Maps keys, which is stale.
4. **Kapnos is read from an undocumented booking API.** src/lib/kapnos.functions.ts line 30 fetches https://kapnos.ecoachmanager.com/coachtrip/api/trip-type-all, described in the file as "the live booking API behind kapnosairportshuttle.com" (lines 9 to 12). There is no agreement with Kapnos.
5. **The Bolt hand-off earns nothing.** src/lib/mobility-links.ts lines 21 to 31 build a Bolt AppsFlyer OneLink with `pid=aloya`. That media source id was chosen by Aloya, not issued by Bolt, so no attribution or payment flows back. Bolt's documented paid route for third parties is the Bolt Business referral scheme (layer 23).

---

## Layer 21: What MaaS taught the world (and why Aloya should not resell tickets)

### 21.1 What the best in the world do

- **MaaS Global (Whim) failed.** The Finnish pioneer filed for bankruptcy in the Helsinki District Court on 14 March 2024 (Mobiili.fi, 16 Mar 2024, citing the insolvency register). Mobility Payments reported it had "burned through €75.5 million in less than seven years" (15 Mar 2024). In 2022 it lost €9.3m on turnover of €3.8m, had about 10,000 active monthly users in Helsinki and 38 staff, down from a peak of 120 (Traffic Technology Today and CCAM-TAC, 21 Mar 2024). Sustainable Bus named the B2C subscription model as a reason for the losses (22 Mar 2024). Umob bought the technology and the Whim app on 18 April 2024 (umob.app press release) and moved it to a pay-per-ride model (Zag Daily, 18 Apr 2024). Founder Sampo Hietanen reflected on the collapse in ITS International (21 Aug 2024).
- **Citymapper stopped selling travel.** Citymapper PASS, its London subscription bundle, ended on 18 June 2023; Citymapper said it "was restricted to London only and there were many limitations that did not allow us to scale it outside of one city" (citymapper.com/news/2597). Its self-service SDKs and APIs ended on 23 June 2023 (citymapper.com/news/2596). Via acquired Citymapper on 15 to 16 March 2023 (Via press release; Via 10-K for 2025), and Via's filing now describes Citymapper's value as data infrastructure, co-branding and in-app advertising for agency customers.
- **The agency as integrator works.** Berlin's BVG Jelbi, built on Trafi, had about 400 locations, about 70,000 bookable vehicles, more than seven million rentals at Jelbi sites since 2019 and over 1.2 million downloads by the end of 2025 (BVG press release, 29 Dec 2025). The public operator owns the customer and the hubs; private operators plug in.
- **Earlier research pass (not re-opened):** Umob takes a provider fee per booking at the same price to the rider, plus employer budgets with one invoice and CO2 reports; Ummadum went bankrupt on 4 Dec 2025; Transit's paid Royale tier is sponsored by agencies in some cities; SBB EasyRide (FAIRTIQ technology) is SBB's fastest-growing sales channel.

### 21.2 Cyprus reality and data

- Cyprus has no single account across bus, bike, scooter, taxi and car sharing. Each operator has its own app (Motion and Pame for buses, Nextbike, Bolt, Electra, RideNow, toGO, Kapnos).
- Bus ticketing is a state system: the Motion card on every public operator, with GMV contracted for account-based ticketing on 750 buses run by six companies (ITS International, 16 Nov 2023). Resale of bus tickets by a third party would need the Ministry's permission and would sit on that state platform.
- Bolt's only published paid route for outsiders is Bolt Business referrals (layer 23). No Cyprus operator was found offering a public reseller or affiliate API.

### 21.3 Aloya today, and its gaps

- Aloya does not transact for any partner. Kapnos, Bolt and Nextbike are deep links (kapnos.functions.ts line 20 "we don't transact"; mobility-links.ts).
- Aloya's only revenue code in the repo is Stripe billing for Aloya Pro (COMMERCIAL.md "Stripe billing"). Every hand-off to a partner earns nothing today.
- src/routes/api/public/partners/apply.ts is a waitlist form that writes to partner_applications; its header says "This is not a console, not keys, not usage, those wait for a paying Truth API customer." There is no partner model behind it yet.

### 21.4 Improvements

1. **Write the rule down: no ticket resale, no consumer bundle (S, very high).** Whim's losses and Citymapper PASS's closure both came from carrying the cost of travel. Aloya should stay a planner, guide and referrer. Put this in a one-page partner policy in the repo (docs/partners.md) so every later decision is checked against it.
2. **Earn on referrals and B2B, not on margin (M, high).** Three income lines that need no capital: the Bolt Business referral scheme (layer 23), employer commute reports and budgets (layer 29), and a paid data or API tier for partners (layer 25). Each is a flat fee or subscription; none needs Aloya to hold riders' money.
3. **Measure every hand-off now (S, high).** Log each outbound partner tap (partner, mode, origin stop, destination stop, hour, no user id) to the existing analytics. Without counts, no partner conversation can start. Use these counts as the evidence in the Kapnos, Electra, RideNow and Bolt approaches.
4. **Position Aloya as the agency's Jelbi, not a rival (L, very high).** The Jelbi lesson is that the public operator owns the customer. Offer CPT, EMEL, OSYPA and OSEA a white-label or co-branded planning layer (Aloya's planner and alerts inside their brand) rather than competing with Pame. This is also the route to EU funding (layer 30).
5. **Do not build a wallet of stored value (S, medium).** Stored value would bring e-money licensing questions; leave money with the operators and with Motion.

Effort and impact: items 1 and 3 are days of work and unblock every other layer in Part C.

### 21.5 Sources

- https://mobiili.fi/2024/03/16/suomalainen-maas-global-kaatui-konkurssiin-ehti-kerata-rahoitusta-yli-90-miljoonaa-euroa/
- https://www.mobility-payments.com/2024/03/15/from-guru-to-poster-child-for-maas-failures-whim-app-founder-calls-it-quits/
- https://www.traffictechnologytoday.com/news/mobility-as-a-service/maas-global-declares-bankruptcy.html
- https://www.ccam-tac.org/news/maas-global-declares-bankruptcy/
- https://www.sustainable-bus.com/news/maas-global-bankruptcy-whim/
- https://umob.app/press/umob-acquires-maas-global
- https://zagdaily.com/micromobility/maas-global-is-not-dead-long-live-maas
- https://www.itsinternational.com/its17/feature/sampo-hietanen-most-likely-youre-going-be-magnificent-corpse-out-all
- https://citymapper.com/news/2597/pass-comes-to-an-end
- https://citymapper.com/news/2596/sdks-and-apis-come-to-an-end
- https://ridewithvia.com/news/via-acquires-citymapper-to-expand-its-end-to-end-transittech-solution
- https://www.sec.gov/Archives/edgar/data/1603015/000160301526000008/via-20251231.htm
- https://www.bvg.de/de/unternehmen/medienportal/pressemitteilungen/20251223-pm-jelbi
- https://www.itsinternational.com/gmv-provide-account-based-ticketing-cyprus-buses/
- Code: src/lib/kapnos.functions.ts, src/lib/mobility-links.ts, src/routes/api/public/partners/apply.ts, COMMERCIAL.md (redesign-roam @ 1508f3f)

---

## Layer 22: Micromobility (bikes, scooters and mopeds anywhere in the trip)

Samuel's point from the brief applies here: micromobility is not only the first or last mile. A bike or scooter can be the middle of a trip, for example to cross from one bus corridor to a faster one. That only works if Aloya knows where vehicles are, what they cost, and where they may legally be ridden and parked.

### 22.1 What the best in the world do

- **GBFS is the open standard.** MobilityData's General Bikeshare Feed Specification is a public, pull-based, near real-time feed of stations and vehicles. Its data policy page gives cities model tender language requiring "a publicly accessible API that conforms to the General Bikeshare Feed Specification" with no authentication and an open licence (gbfs.org/documentation/data-policy). Transit publishes best practice for cities requiring public GBFS feeds, citing Los Angeles permit language (resources.transitapp.com, article 296).
- **Licence fields.** The specification recommends an open data licence and says every data set SHOULD state it, using `license_id` (an SPDX identifier, added in v3.0) or `license_url` in system_information.json (gbfs.org reference; GBFS v3.0 gbfs.md).
- **Jelbi** shows micromobility at transit hubs: Voi, Lime, Dott, Nextbike, Bolt and others bookable in one app at about 400 hubs (BVG, 29 Dec 2025; Google Play listing).

### 22.2 Cyprus reality and data

- **Nextbike** runs docked bikes in five regions (Limassol, Nicosia, Larnaca, Paphos, Famagusta) per src/lib/bikeshare.functions.ts lines 3 to 6. Earlier research pass: Nextbike publishes GBFS v2.3 under CC0 with a 60 s refresh.
- **Bolt scooters** run in Nicosia. The national access point publishes a "boltstations" dataset of mandated parking zones (src/lib/bolt-scooter.functions.ts lines 5 and 32). Earlier research pass: Bolt scooters cost from €0.15 per minute and Bolt publishes no GBFS feed for Cyprus.
- **Electra** (Digital Valley Ltd, Nicosia) offers shared e-mopeds from €0.22 per minute in Limassol, Larnaca and Nicosia, with e-bikes and e-scooters from €0.15 per minute listed as "soon" (electra.space, home page; T&C PDF names Digital Valley Ltd). It also sells a €230 per month moped subscription (Bazaraki listing, 10 Apr 2026). No public feed was found.
- **Law.** Two amending laws to the 2018 Bicycles and Personal Mobility Devices Law were published in the Official Gazette on 22 April 2026 (Law 107(I)/2026 on cylaw.org) and came into force on 19 May 2026, raising the minimum e-scooter age from 14 to 17, regulating where devices may be used and setting rules for rental operators (Cyprus Mail and Politis, 19 May 2026; ETSC, 26 May 2026). E-scooters may be used only on roads with a limit of up to 30 km/h and on cycle paths (Cyprus Mail, 1 Sep 2026). A draft decree, in consultation until 26 Sep 2026, allows police and municipal wardens to impound scooters for 30 to 90 days for riding in a prohibited area, riding under 17, or a device capable of more than 25 km/h (Cyprus Mail, 27 Aug 2026; Philenews). Nicosia Municipality is creating more than 100 scooter parking points and expanding 30 km/h zones (Philenews). The decree is a draft as of the latest source found; the brief's "from Sep 2026" date for impoundment is not confirmed as in force.

### 22.3 Aloya today, and its gaps

- **Nextbike is integrated** through https://maps.nextbike.net/maps/nextbike-live.json?city=190,206,940,957,889 (bikeshare.functions.ts line 32), Nextbike's live JSON rather than its GBFS feed. The file sets honest rules: never recommend a station with 0 bikes or a destination with 0 free racks, assume 16 km/h, add 90 s to unlock and 60 s to return, and only suggest cycling when it saves at least 3 minutes (lines 15 to 22). The licence of nextbike-live.json was not checked in this pass; the GBFS feed's licence is the safer basis.
- **Bolt scooters are integrated** only as Nicosia parking zones from the NAP (bolt-scooter.functions.ts), plus the unpaid deep link in mobility-links.ts. Aloya cannot see live scooter positions or battery.
- **Electra is not integrated.**
- **Aloya republishes a merged feed.** src/routes/api/public/gbfs[.]json.ts publishes GBFS 2.3 auto-discovery for "Nextbike (5 cities, docked bikes) and Bolt (Nicosia, e-scooter parking zones)" so that catalogues, OpenTripPlanner and Transitland can pick it up (lines 1 to 9). Its system_information (gbfs/system_information[.]json.ts lines 24 to 36) has `start_date: "2024-01-01"`, which predates Aloya, and no licence field; `purchase_url` points at aloya.cy, where nothing can be purchased; and the operator line names "Bolt Cyprus" as an aggregated operator though Bolt has not agreed to this.
- **Mid-trip micromobility.** Whether the planner can insert a bike or scooter leg between two bus legs is a routing question covered in Part B; this layer only notes that the data layer supports bikes at both ends of a trip, not live scooters anywhere.

### 22.4 Improvements

1. **Fix the merged GBFS feed this week (S, high).** In system_information: set `start_date` to the day the feed first went live; drop or correct `purchase_url`; add `license_url` (GBFS 2.3 has no `license_id`; that field arrived in v3.0) pointing at a page that states each source's licence (Nextbike's GBFS licence as published; the NAP's licence for Bolt zones); keep `attribution_organization_name`. Rename the operator line to "Aloya (aggregator) using Nextbike and Cyprus NAP data" until Bolt agrees otherwise.
2. **Switch Nextbike to its GBFS feed (S, medium).** Reading the GBFS endpoint gives a stated licence and the standard rental_uris already used by nextbike links (mobility-links.ts lines 13 to 16).
3. **Ask Electra and Bolt for public GBFS (S to write, high if granted).** Cite the GBFS data policy and the EU MMTIS deadline of 1 Dec 2026 for vehicle-sharing availability data (layer 30). Offer Aloya's hand-off counts (layer 21, item 3) as the value they get back.
4. **Show legal riding and parking, not just vehicles (M, high).** Combine the NAP scooter zones, the 30 km/h rule and Nicosia's new parking points into a "can I ride and park here" layer. When a scooter leg would end outside a permitted zone, plan the walk from the nearest zone instead. With impoundment of 30 to 90 days in the draft decree, a wrong suggestion now has a real cost to the rider.
5. **Age gate the scooter suggestion (S, medium).** Do not suggest an e-scooter leg to riders who have told Aloya they are under 17, and say why.
6. **Middle-of-trip legs (M, high, shared with Part B).** Allow a bike or scooter leg between two transit legs when it reaches a stop with a markedly better next departure, using only modes Aloya can see live (Nextbike now; Electra and Bolt after item 3).

### 22.5 Sources

- https://gbfs.org/documentation/data-policy
- https://www.gbfs.org/documentation/reference/
- https://github.com/MobilityData/gbfs/blob/v3.0/gbfs.md
- https://resources.transitapp.com/article/296-best-practices-for-requiring-public-gbfs-feeds
- https://www.bvg.de/de/unternehmen/medienportal/pressemitteilungen/20251223-pm-jelbi
- https://www.electra.space/
- https://www.electra.space/tac/ElectraCY_T&C.pdf
- https://www.bazaraki.com/adv/5713444_e-moped-for-rent/
- https://www.cylaw.org/nomoi/arith/2026_1_107.pdf
- https://cyprus-mail.com/2026/05/19/e-scooter-age-limit-rise-to-17-goes-into-force
- https://www.en.politis.com.cy/news/1006295/cyprus-sets-minimum-age-for-e-scooter-use-at-17-years
- https://etsc.eu/greece-and-cyprus-tighten-national-rules-on-e-scooters
- https://cyprus-mail.com/2026/08/27/e-scooter-offences-could-bring-90-day-impoundment
- https://en.philenews.com/local/cyprus-e-scooter-seizure-decree-nicosia-parking/
- https://www.cyprus-mail.com/2026/09/01/bolt-unconcerned-over-new-e-scooter-regulations
- Code: src/lib/bikeshare.functions.ts, src/lib/bolt-scooter.functions.ts, src/lib/mobility-links.ts, src/routes/api/public/gbfs[.]json.ts, src/routes/api/public/gbfs/system_information[.]json.ts (redesign-roam @ 1508f3f)

---

## Layer 23: Ride-hail, taxis and airport shuttles

### 23.1 What the best in the world do

- **Ride-hail inside other products.** Bolt launched a ChatGPT integration across all its markets at once on 29 to 30 July 2026: riders see an upfront price estimate, route options, driver arrival time and a suggested pickup point, then the details transfer to the Bolt app, where booking and payment are completed; in-chat payment is planned later (Bolt blog, 29 Jul 2026; Zag Daily, 28 Jul 2026; Cities Today, 10 Aug 2026). The pattern is a hand-off with context, not a resale.
- **Paid referral for companies.** Bolt Business pays through PartnerStack. The PartnerStack listing and Bolt's legal terms describe €150 per company after its first ride, and the referred company gets 25% off 20 rides (market.partnerstack.com/page/bolt; bolt.eu Bolt Business referral terms, clause 3.2). Bolt's own referral page says €150 after 5 rides and up to €200 per company, with a further €50 when the company becomes active (bolt.eu/en-ie/business/refer-a-company). The two routes publish different thresholds; read them separately.
- **Transit plus taxi in one planner.** Jelbi includes Taxi Berlin alongside sharing services (Google Play listing).

### 23.2 Cyprus reality and data

- **Bolt** is the dominant ride-hail app. Earlier research pass: Uber left Cyprus in 2016; other options include inDrive, CabCY, Alfa, VIPS, Yango and Travel & Express shared intercity taxis; Bolt has no public booking API, and Bolt Business Ride Booker is available through Iomob.
- **Kapnos Airport Shuttle** has run shared airport transfers since 2008 covering Larnaca (LCA) and Paphos (PFO) airports, with stops at Nicosia Shuttle Station on Kyrenias Avenue, Ayia Napa and Protaras (kapnosairportshuttle.com and /timetables). It says it operates over 100 daily departures (Kapnos blog, 3 Jun 2026) and expanded Paphos airport services in June 2026 (Cyprus Mail and Sigmalive, 29 Jun 2026). Its routes went live on Google Maps on 20 Feb 2026, announced by Igor Akimov (LinkedIn). Its booking system runs at kapnos.ecoachmanager.com/coachtrip/ (page footer "2026 Kapnos Airp..."). Earlier research pass: €9 from Larnaca airport to Nicosia, sold on Klook, no affiliate scheme; contact named as Marios Socratous.
- **The public alternative to Kapnos** for Larnaca airport to Nicosia is a two-ticket trip via route 425 that is cheaper but roughly twice as long and stops running in the afternoon (buscyprus.cy guide, updated 16 Oct 2026).

### 23.3 Aloya today, and its gaps

- **Kapnos.** kapnos.functions.ts reads the undocumented endpoint `/coachtrip/api/trip-type-all` (line 30), which returns "every active route with its pickup/dropoff coordinates and the next ~60 scheduled departures per route, including seat availability" (lines 9 to 12). It sets honest rules (suggest only when both ends are within walking range of the same direction-aware route, filter departures already gone, show seat availability as is) and deep-links to kapnosairportshuttle.com (lines 343 to 344). The public route at src/routes/api/public/kapnos.ts re-exposes this with CORS `*`, so anyone can use Aloya as a proxy to Kapnos's booking backend. There is no agreement; the endpoint can change or be blocked without notice, and showing a third party's live seat counts without permission is a risk.
- **Bolt.** mobility-links.ts builds `https://bolt.onelink.me/UdR6/aloya?pid=aloya&c=aloya_last_mile|aloya_scooter&...` (lines 21 to 31). The comment explains it opens the Bolt app because bolt.onelink.me carries Bolt's app links, and that Bolt publishes no pickup or destination parameters (lines 3 to 11). The `pid` is self-chosen; AppsFlyer media sources are configured by the app owner, so this link earns nothing and may not even be counted.
- **No taxi fares.** maps.server.ts mentions a "taxi quote" caller (line 4), but there is no licensed taxi fare source or booking.

### 23.4 Improvements

1. **Join the Bolt Business referral scheme now (S, medium).** It is free to join and pays per company, which matches the employer layer (layer 29). Put the referral link on a "For employers" page and in commute reports, not in the rider's taxi button, since it rewards company sign-ups, not rides.
2. **Write to Kapnos (S to write, high).** Ask for three things in order of preference: written permission to use the trip-type endpoint with a named rate limit; a referral arrangement for bookings that start in Aloya; or a GTFS feed (they already publish to Google Maps via the work described by Igor Akimov). Offer Aloya's tap counts as evidence. Until there is an answer, cache the feed for at least 15 minutes, stop exposing it through the public CORS route, and stop showing live seat counts.
3. **Make the Bolt hand-off honest (S, medium).** Until Bolt issues a partner id, label the button "Open Bolt" and stop implying a partnership. Ask Bolt Cyprus for a partner media source when the hand-off counts justify it.
4. **Bolt in AI assistants (M, medium).** Aloya already exposes an MCP server (layer 25). When a rider asks Aloya's assistant for a taxi, hand off to Bolt the same way ChatGPT does: price estimate in Aloya where a lawful source exists, then open Bolt. Do not scrape fares.
5. **Taxi as a fallback inside a bus plan (M, high).** When a missed connection leaves a long wait (Part A, layer 6), offer "taxi to the next stop on this route" as one option with an honest note that the fare is set by the operator. This is a hand-off, not a booking.

### 23.5 Sources

- https://bolt.eu/en/blog/chat-gpt-integration
- https://zagdaily.com/connected/bolt-integrates-ride-hailing-into-chatgpt
- https://cities-today.com/bolt-adds-ride-hailing-to-chatgpt/
- https://market.partnerstack.com/page/bolt
- https://bolt.eu/en/legal/bolt-business/tnc-business-referral/
- https://bolt.eu/en-ie/business/refer-a-company/
- https://kapnosairportshuttle.com/
- https://kapnosairportshuttle.com/timetables
- https://kapnosairportshuttle.com/blog/cyprus-shuttle-book
- https://cyprus-mail.com/2026/06/29/kapnos-expands-shuttle-services-to-and-from-paphos-airport
- https://www.linkedin.com/posts/igorakimov1_cyprus-publictransport-googlemaps-activity-7430608887290064896-EQDv
- http://kapnos.ecoachmanager.com/coachtrip/
- https://buscyprus.cy/blog/airport/larnaca-airport-to-nicosia-by-bus
- Code: src/lib/kapnos.functions.ts, src/routes/api/public/kapnos.ts, src/lib/mobility-links.ts, src/lib/maps.server.ts (redesign-roam @ 1508f3f)

---

## Layer 24: Ticketing and payments (Motion, JCC and what comes next)

### 24.1 What the best in the world do

- **Account-based ticketing (ABT)** keeps the passenger's account in the cloud and treats the card, phone, watch or bank card as an identifier, which makes fare capping and multi-operator fares easier (GMV press release on Cyprus).
- **Open payment at the validator.** GMV rolled out contactless EMV bank card payment across most of the Madrid regional consortium's concessions after a December 2024 pilot (GMV press release).
- **Third-party apps read, operators sell.** The common pattern among planners is to show fares and deep-link to the operator's own ticketing; the failures in layer 21 came from apps carrying the cost of the fare.

### 24.2 Cyprus reality and data

- **Fares, Nicosia and Larnaca (CPT), from 3 Aug 2026:** urban single €2.70 cash or €2.00 on a Motion card; night single €4.70 or €3.50; 30 days €66.90 on a personalised card or €93.60 anonymous; 365 days €668.50 (publictransport.com.cy, ticket fares page). The cash fare rose from €2.40 to €2.70 (Kathimerini English, 3 Aug 2026).
- **Fares, Limassol (EMEL), from 5 Nov 2026:** single from the driver €2.50, still €2.00 from Motion eWallet; night €4.00; day €7.00; 7 days €35.00; 30 days €50.00 personalised or €60.00 anonymous; reduced fares only on a Motion card from that date (limassolbuses.com, "Fare changes", 27 Aug 2026; an earlier notice dated 11 Aug gave 12 Oct, superseded).
- **Usage.** CPT carried 12.3 million passengers in 2025 and 82.6% of its passengers use Motion (Cyprus Mail and CBN, 16 Sep 2026; CPT LinkedIn, 15 Sep 2026). Earlier research pass: 8.78M trips Jan to Aug 2026 (+14.5%), 63% on 30-day passes. CPT's spokesman said ticket sales rose 50% between 2019 and 2025 and that fares are set by contract until 2028 (AlphaNews, 14 Oct 2026).
- **ABT and card payment.** The Ministry awarded GMV an ABT contract for 750 buses run by six companies, with a bank card pilot in Famagusta (ITS International, 16 Nov 2023). OSEA fitted 89 Famagusta buses with POS terminals (Kathimerini English, 26 May 2025). On 30 Oct 2026 the Transport Minister said the card payment system already running in Limassol would be extended to other cities and that online booking for intercity coaches is being studied (Sigmalive and info.cy, 30 Oct 2026). CPT says it is ready to extend to card payments "as soon as new functions are approved" (Cyprus Mail, 15 Oct 2026). Intercity remains cash, €5 to €8 by distance (aloya.cy/fares, citing the same tariff).
- **JCC Smart** is the account system behind Motion top-ups; publictransport.com.cy says online top-up is "thru online payment with Jcc" (fares and cards page).

### 24.3 Aloya today, and its gaps

- **JCC login proxy.** As set out at the top of this part: jcc.functions.ts posts the rider's email and password (converted to char codes "so we look like a normal browser session", lines 20 to 24) to `/smartauthms/api/v1/Account/Login`, refreshes tokens (lines 117 to 143), and reads `/smartms/api/v1/BusFare/Transactions` for the last 30 days (lines 168 to 183), deriving balance from the newest transaction (lines 243 to 250). The header says credentials are never logged or stored and that tokens live in the browser's localStorage (lines 3 to 5). src/routes/wallet.tsx line 11 calls it from the web wallet, and src/routes/api/public/wallet.ts repeats it as an unauthenticated CORS `*` endpoint for the native app, adding a spoofed referer to publictransport.com.cy's web service (lines 28 to 33).
- Why this matters, in plain terms. Aloya's server holds a third party's password in transit and impersonates that third party's own website to get past a control (the CORS lock) that JCC put there deliberately. If JCC changes its API, the feature breaks; if JCC objects, Aloya has no defence; if Aloya's server or logs were ever compromised, riders' JCC credentials would be exposed. A public endpoint that accepts JCC passwords from any origin also makes Aloya a ready-made credential-testing proxy against JCC. Whether this breaks JCC's terms or any law was not established in this pass; a lawyer should look at it. What is certain is that it would end any partnership conversation with JCC, the Ministry or GMV.
- **Wallet passes and OCR.** COMMERCIAL.md lists Google Wallet passes and the repo has src/routes/api/public/wallet/pass.ts and wallet/ocr.ts (card scanning via Gemini, OpenAI or a gateway). These are fine in principle but share the open-CORS problem (layer 25).
- **Fares content.** aloya.cy/fares and aloya.cy/motion-card already publish the August 2026 tariff, which is useful and accurate against the CPT page.

### 24.4 Improvements

1. **Turn off the password proxy now (S, very high).** Remove the login and refresh actions from src/routes/api/public/wallet.ts immediately (that endpoint is open to the world). On the web, hide "Sign in with JCC" behind a flag that is off by default. Keep a manual balance mode: the rider types or scans the card number and Aloya links to publictransport.com.cy's own balance check and top-up pages, which is what the operator provides.
2. **Label anything left as unofficial (S, high).** If any JCC-derived feature stays for testing, label it "Unofficial. Not provided by JCC or Motion" and never send a password to Aloya's server.
3. **Ask for read-only partner access during the ABT rollout (M to arrange, very high).** Write to the Ministry's ABT project and to JCC: Aloya would like a consented, read-only, token-based (OAuth style) feed of a rider's balance, pass expiry and recent validations, so it can say "your 30-day pass ends tomorrow" and "this trip will cost €2.00 on Motion". ABT is the moment to ask, because the account model is being built now.
4. **Fare engine in the planner (M, high).** Show each plan's fare in the rider's own terms: cash, Motion anonymous, Motion personalised, discounted, and the 60-minute free transfer (two transfers within 60 minutes for €2.00 on eWallet, per info.cy quoting the CPT table). Different operators have different rules (EMEL's eWallet single stays €2.00 while cash becomes €2.50 from 5 Nov 2026).
5. **Card payment availability flag (S, medium).** Track by operator and route whether bank card payment is accepted on board (Limassol yes, others not yet per the Minister on 30 Oct 2026), and show "cash or Motion only" where true. Update as the rollout spreads.
6. **Do not sell tickets (S, high).** Repeat of layer 21. Deep-link to the operator's top-up and, when intercity online booking arrives, to that.

### 24.5 Sources

- https://www.gmv.com/en/communication/press-room/press-releases/intelligent-transportation-systems/gmv-continues-modernize
- https://www.itsinternational.com/gmv-provide-account-based-ticketing-cyprus-buses/
- https://www.gmv.com/en/communication/press-room/press-releases/transportation-bus/gmv-implements-emv-payment-system
- https://www.publictransport.com.cy/cms/page/cash-tickets
- https://www.publictransport.com.cy/cms/page/fares-and-cards
- https://knews.kathimerini.com.cy/en/news/monday-commute-gets-more-expensive-in-nicosia-and-larnaca
- https://limassolbuses.com/fare-changes-2/
- https://info.cy/cyprus-buses-fares
- https://cyprus-mail.com/2026/09/16/cyprus-public-transport-enters-new-digital-era-with-revamped-pame-app-enhanced-website
- https://www.cbn.com.cy/article/133592/cyprus-public-transport-enters-a-new-digital-era-with-a-revamped-pame-app-and-new-enhanced-website-videos
- https://en.alphanews.live/cyprus/e2-70-bus-fare-how-the-company-responds-to-questions-about-the-ticket-price-and-what-it-says-about-the-lack-of-pos-terminals/
- https://knews.kathimerini.com.cy/en/news/contactless-payments-coming-to-famagusta-buses-this-october
- https://en.sigmalive.com/cyprus-plans-improvements-to-bus-services-and-ticketing-system/
- https://info.cy/n-327--cyprus-to-expand-card-payments-on-buses-and-add-online-bookings
- https://cyprus-mail.com/2026/10/15/cyprus-public-transport-dismisses-audit-report-says-it-has-already-moved-on
- https://aloya.cy/fares
- Code: src/lib/jcc.functions.ts, src/routes/wallet.tsx, src/routes/api/public/wallet.ts, src/routes/api/public/wallet/pass.ts, src/routes/api/public/wallet/ocr.ts (redesign-roam @ 1508f3f)

---

## Layer 25: Letting others integrate Aloya (APIs, licence, MCP and widgets)

### 25.1 What the best in the world do

- **Standards first.** For public transport, GTFS and GTFS-RT; for shared vehicles, GBFS (public data) and MDS, which the Open Mobility Foundation describes as regulator-facing and not public (MDS version guidance; gbfs.org FAQ). MDS 2.1 was released in July 2026 (OMF, 20 Jul 2026). TOMP-API, the transport operator to MaaS provider API, is openly published by the TOMP working group (github.com/TOMP-WG/TOMP-API). Earlier research pass: TOMP-API v2.0 adoption is weak.
- **Clear terms beat clever code.** Transitous publishes a short usage policy (open-source clients, light usage, contact before heavy use, keep attribution) and enforces it (transitous.org/api; GitHub issue 2399, Aug 2026). Citymapper closed its self-service API in June 2023 rather than run it without a business model (citymapper.com/news/2596).
- **Keys and quotas.** Any public API that calls paid upstreams uses per-client keys, quotas and origin restrictions; this is ordinary practice, not a differentiator.

### 25.2 Cyprus reality and data

- The national bus data is open: GTFS, SIRI and GTFS-RT on the Cyprus National Access Point and data.gov.cy (traffic4cyprus.org.cy SIRI dataset page; data.gov.cy dataset 1069). Earlier research pass: Transitland lists the bus feed as CC-BY-4.0 (f-intercity~buses~cy).
- Because the base data is open, Aloya's value to integrators is not the timetable; it is the cleaned, merged and corrected layer on top (reliability, stop corrections, micromobility merge, Kapnos once permitted) and the planner.

### 25.3 Aloya today, and its gaps

- **Licence conflict.** LICENSE (proprietary, evaluation only), README line 256 to 260 and COMMERCIAL.md all say proprietary. Earlier memory said MIT. Nothing in the repo grants any outside developer a right to use Aloya's API output.
- **Open routes.** 59 of the 63 non-hook, non-OG route files send CORS `*` with no key. Cron hooks are protected (18 of 19 hook files check CRON_SECRET or similar; ping-gap-compute.ts uses cronGuard from src/lib/cron-auth.server.ts), and bedrock-test.ts and metrics.ts are admin-gated. Examples of costly or sensitive open routes: plan.ts (the planner; comment lines 6 to 9 say it is CORS-open so "any other first-party native client" can call it), places-autocomplete.ts (Mapbox Search Box, billed per request), walk-directions.ts (Mapbox Directions), tts.ts (ElevenLabs then OpenAI then gateway, input clipped at 400 characters by TtsSchema), stt.ts (OpenAI speech to text), parse-trip-intent.ts (Gemini or OpenAI), wallet/ocr.ts (Gemini), streetview.ts (Mapillary, free but token-bound), kapnos.ts and wallet.ts (third parties). A single script can run up Aloya's Mapbox, ElevenLabs, OpenAI and Gemini bills.
- **MCP server.** src/lib/mcp/index.ts defines "aloya-mcp" version 0.2.0 with tools search_stops, get_stop_arrivals, watch_stop_arrivals and plan_trip (instructions at line 12; tests in index.test.ts). src/routes/mcp.ts mounts it at /mcp with OAuth protected-resource metadata (auto-generated by @lovable.dev/mcp-js). Whether it is reachable in production was not verified in this pass.
- **Partner intake.** partners/apply.ts collects applications with a 24-hour email dedupe and a honeypot field ("company"), but there is no key issuance or usage tracking.
- **GBFS republishing** is covered in layer 22.

### 25.4 Improvements

1. **Resolve the licence in one sentence (S, very high).** Decide and write down: the code stays proprietary (current files) and the public API and data outputs are offered under separate terms. Suggested split: code proprietary; Aloya-derived open data (for example corrected stop positions and the GBFS merge) under CC BY 4.0 with attribution to Aloya and to each source; API access under written API terms. Update memory and README so nobody believes it is MIT.
2. **Keys, quotas and origin rules on costly routes (M, very high).** Add a small middleware used by every public route: (a) first-party clients (web app origin, native app with an app attestation or signed token) pass; (b) third parties need an API key issued from partners/apply; (c) per-key and per-IP quotas stored in the existing database or an edge KV; (d) CORS restricted to app.aloya.cy, aloya.cy and registered partner origins for plan, places-autocomplete, walk-directions, tts, stt, parse-trip-intent, wallet/ocr, kapnos and wallet. Keep read-only, cheap, cacheable routes (stops, gbfs.json, realtime snapshot) open with CDN caching.
3. **Budget alarms on upstreams (S, high).** Set hard monthly caps in Mapbox, ElevenLabs, OpenAI and Gemini consoles and alert at 50% and 80%, so abuse fails safe.
4. **Publish the MCP server properly (S, medium).** Verify /mcp is live, document the four tools, require a key for watch_stop_arrivals (long polling is the expensive one), and list it in MCP directories. This is the cheapest way to make Aloya "integrable" by AI assistants, mirroring Bolt's ChatGPT move (layer 23).
5. **Document deep links (S, medium).** A public page listing stable URLs: open a stop, a line, a plan from A to B, a live trip share. Partners such as hotels and universities (layers 28 and 29) can then link without an API.
6. **Embeddable departures widget (M, high).** A script tag or iframe showing the next departures for one or more stops, with Aloya attribution and a "plan in Aloya" link. This is the product for hotels, campuses, employers and municipalities.
7. **Attribution everywhere (S, medium).** Show "Data: Cyprus NAP (CC BY 4.0), Nextbike, ..." in the app and in API responses, as the open licences require and as Transitous and others expect.
8. **Do not adopt TOMP-API or MDS yet (S, low).** Neither has Cyprus counterparts today. Revisit only if a Cyprus city asks for MDS from scooter operators and wants Aloya to help.

### 25.5 Sources

- https://www.openmobilityfoundation.org/about-mds/mds-version-guidance
- https://www.openmobilityfoundation.org/mds-new-tools-for-safer-streets
- https://gbfs.org/documentation/faq
- https://github.com/TOMP-WG/TOMP-API
- https://transitous.org/api
- https://github.com/public-transport/transitous/issues/2399
- https://citymapper.com/news/2596/sdks-and-apis-come-to-an-end
- https://www.traffic4cyprus.org.cy/en/dataset/publictransportrealtime_siri
- https://www.data.gov.cy/en/dataset/1069
- Code: LICENSE, README.md, COMMERCIAL.md, .env.example, src/routes/api/public/* (plan.ts, places-autocomplete.ts, walk-directions.ts, tts.ts, stt.ts, parse-trip-intent.ts, wallet/ocr.ts, streetview.ts, kapnos.ts, wallet.ts, sighting.ts, partners/apply.ts, bedrock-test.ts, metrics.ts, hooks/*), src/lib/schemas/public-api.ts, src/lib/maps.server.ts, src/lib/ai-planner.functions.ts, src/lib/stop-photo.server.ts, src/lib/mcp/index.ts, src/routes/mcp.ts (redesign-roam @ 1508f3f)

---
