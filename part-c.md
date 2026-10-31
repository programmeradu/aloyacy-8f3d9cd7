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

## Layer 26: Google Maps, Apple Maps, Moovit, Transitous and the local apps

### 26.1 What the best in the world do

- **Google Maps** covers transit wherever agencies publish GTFS to it, and is adding a learned commute "Transit mode" on Android (Android Authority teardown, 20 Jan 2026, cited in Part A layer 1).
- **Moovit** combines operator data with crowd reports from a network of local editors and offers live directions with get-off alerts (moovit.com/about-us; Moovit Nicosia guide page).
- **Transitous** is a community-run, provider-neutral routing service on the open-source MOTIS engine, free for open-source, non-commercial, light-usage clients, with source licences tracked per feed (transitous.org; transitous.org/api; Träwelling licensing help page). Its maintainers apply the open-source requirement strictly (GitHub issue 2399, Aug 2026). A July 2026 issue notes that Transitous also carries non-commercial (NC) data and that commercial open-source clients may not be able to use all of it (issue 2293).

### 26.2 Cyprus reality and data

- **Google.** Kapnos routes went live on Google Maps on 20 Feb 2026 after years of advocacy by Igor Akimov and volunteers (LinkedIn post, 20 Feb 2026; reshared by Alexia Solomou, 27 Feb 2026). Earlier research pass: EMEL appeared on Google around Feb 2026 and coverage is still described as patchy.
- **Moovit** lists NPT, OSEA, Intercity, LPT and EMEL lines with real-time tracking, and Paphos agencies including OSYPA, Intercity Buses and Kapnos Airport (Moovit Nicosia, Paphos and line pages). Its Nicosia pages advertise "Ride & Pay with Moovit in Nicosia" (Moovit Pay). Whether Moovit Pay actually works in Cyprus was not verified; the text may be a global template.
- **Apple Maps** coverage of Cyprus transit was not verified in this pass.
- **Official apps.** The Ministry's "Cyprus Bus" app by MOTION (built by GMV, package com.gmv.cyprusbus2) gives timetables and live arrivals island-wide (motionbuscard.org.cy/app). CPT's relaunched Pame app (15 Sep 2026) offers live arrivals, a journey planner, maps and Motion top-up (publictransport.com.cy Pame page; Cyprus Mail, 16 Sep 2026).
- **Independent field** found in this pass: BusCyprus (buscyprus.cy and buscyprus.app), cyprustransport.com.cy, info.cy/buses, cyprusbus.app, CyBuses (cybuses.com) and Urbaneel (urbaneel.com). Earlier research pass also listed BusAPP and buscyprus.com.
- **Transitous.** Earlier research pass: Cyprus coverage is partial, and realtime was added in PR #1427.

### 26.3 Aloya today, and its gaps

- Aloya reads the same national GTFS and GTFS-RT as everyone else (Part A layer 5), so live arrivals are not a differentiator. The open bus data that powers Aloya also powers at least six other Cyprus apps and sites listed above.
- Aloya's distinct assets in the code are its reliability and ETA work (route-reliability.ts, stop-reliability.ts, eta-log.ts, hooks/eta-backtest.ts), crowd signals (sighting.ts, stop-skip-report.ts, rider-fix.ts), multimodal links (Nextbike, Bolt zones, Kapnos, park and ride in park-and-ride.ts, EV chargers in src/lib/ev-chargers.functions.ts) and the in-trip companion described in Part A.
- Aloya is not listed in the Mobility Database or contributing to Transitous, so other tools cannot discover its GBFS merge.

### 26.4 Improvements

1. **Compete on trust, not on coverage (S to decide, very high).** Make "how sure we are" the visible differentiator: confidence on every ETA, ghost-bus warnings and honest fallbacks (Part A layer 5). Nobody in the Cyprus field publishes this.
2. **Win on Cyprus multimodal coverage (M, high).** Kapnos with permission (layer 23), Electra and Bolt with GBFS (layer 22), UCY shuttles (layer 29), car sharing deep links (layer 27). Each is something Google and Moovit do not have.
3. **List the GBFS merge in the Mobility Database (S, medium)** after the fixes in layer 22, so it is discoverable and so Aloya is credited as a Cyprus data source.
4. **Contribute upstream to Transitous (S, medium).** Fix or add the Cyprus feed configuration and licence metadata in the Transitous repo. Do not use the Transitous API in Aloya's commercial app: its policy requires open-source, non-commercial clients. Contributing builds reputation with the European open transport community at no cost.
5. **Track competitors monthly (S, low).** A short checklist: Pame, Cyprus Bus, Moovit, Google, BusCyprus. What changed, what Aloya should copy, what Aloya does better.

### 26.5 Sources

- https://www.androidauthority.com/android-transit-mode-3633735/
- https://moovit.com/about-us
- https://moovitapp.com/index/en/public_transit-Nicosia-4443
- https://moovitapp.com/index/en/public_transit-line-5-Nicosia-4443-1804341-72909783-1
- https://moovitapp.com/index/en/public_transit-%CE%A0%CE%AC%CF%86%CE%BF%CF%82_Paphos-5837
- https://transitous.org/
- https://transitous.org/api
- https://github.com/public-transport/transitous/issues/2399
- https://github.com/public-transport/transitous/issues/2293
- https://help.traewelling.de/en/features/timetable/licensing/
- https://www.linkedin.com/posts/igorakimov1_cyprus-publictransport-googlemaps-activity-7430608887290064896-EQDv
- https://www.linkedin.com/posts/alexiasolomou_excellent-news-for-public-transport-in-cyprus-activity-7433250933746257921-S37Q
- https://www.motionbuscard.org.cy/app
- https://www.publictransport.com.cy/cms/page/bus-bike-pame-app
- https://cyprus-mail.com/2026/09/16/cyprus-public-transport-enters-new-digital-era-with-revamped-pame-app-enhanced-website
- https://buscyprus.cy/blog/airport/larnaca-airport-to-nicosia-by-bus
- https://cyprustransport.com.cy/tickets
- https://info.cy/buses/limassol
- https://cyprusbus.app/
- https://urbaneel.com/limassol/
- Code: src/routes/api/public/route-reliability.ts, stop-reliability.ts, eta-log.ts, hooks/eta-backtest.ts, sighting.ts, stop-skip-report.ts, rider-fix.ts, park-and-ride.ts, src/lib/ev-chargers.functions.ts (redesign-roam @ 1508f3f)

---

## Layer 27: Cars without owning one (EV charging, car sharing, rental and parking)

The goal in the brief is fewer private cars. People who keep a car often do so for the few trips buses cannot do. Car sharing, park and ride and honest parking information let Aloya serve those trips without pushing people back into ownership.

### 27.1 What the best in the world do

- **Car sharing inside the transit app.** Jelbi offers Miles and Sixt share car sharing alongside buses and trains, with parking included in provider business areas (Google Play listing, carsharing variant).
- **Parking data as public data.** The EU MMTIS rules make "availability and location of vehicle-sharing and car parking spaces" and parking tariffs dynamic data due on national access points by 1 Dec 2026 (DG MOVE presentation, TTS Italia, Nov 2024; Regulation 2024/490).

### 27.2 Cyprus reality and data

- **EV charging.** A Transport Ministry letter of 7 Oct 2026 counts 384 publicly accessible charging points at 221 stations: 76 stations in Nicosia, 57 Limassol, 32 Paphos, 29 Larnaca, 27 Famagusta. The Ministry plans 94 new fast-charging points by 2028 (76 at 150 kW for cars, 18 at 200 to 350 kW for heavy vehicles) for about €10m under the Recovery and Resilience Plan (Cyprus Mail, 23 Oct 2026; Philenews; electrive, 26 Oct 2026). A Cyprus Mail article of 6 Aug 2026 had counted roughly 250 public charging stations at the start of 2026; counts differ by definition. EAC runs the e-charge network (eac.com.cy).
- **Car sharing.** RideNow: 850+ cars across Cyprus, all automatic, start in one city and finish in another (Limassol, Nicosia, Larnaca, Paphos and both airports) (App Store listing); short-ride tariff €1 start plus €0.07 per minute plus €0.27 per km with fuel included and a €19 airport drop-off fee (ridenow.tech/short_rides); airport parking fee from €10, rising to €25 or more at peak (ridenow.tech/airports); RideNow Business with one monthly invoice (ridenow.tech/business). toGO: from €0.29 per minute plus €0.25 per km for a Kia Rio, hourly and daily packages, airport surcharge (togorent.com/price.html). Earlier research pass: toGO has 35 cars; CAROL offers peer-to-peer car sharing. The Republic had 30,444 licensed rental cars in 2025 (rentalsincyprus.com blog, secondary source).
- **Parking.** Limassol's smart parking system covers about 2,500 spaces (around 1,500 on-street and 876 off-street) under a €5.17m plus VAT contract with Blue Sun Automation, with sensors, an app with real-time availability and electronic payment, launched in early July 2026 (Cyprus Mail, 26 Jun 2026; Politis; Fast Forward, 11 Jun 2025). EasyPark is live on Limassol streets "since 2026" (easypark.com/en-cy). Earlier research pass: Smart Parking Nicosia (Yodiwo with JCC), Find2Park, plate recognition in Larnaca and sensors in Paphos.

### 27.3 Aloya today, and its gaps

- **EV chargers** are read from the NAP's electric_vehicle_chargers DATEX II dataset (src/lib/ev-chargers.functions.ts, feed URL line 20, on fixcyprus.cy/gnosis/open/api/nap/datasets/).
- **Park and ride** exists as a public route (park-and-ride.ts).
- **Car sharing** (RideNow, toGO, CAROL) is not integrated. **Parking availability** is not integrated.

### 27.4 Improvements

1. **Car sharing deep links (S, medium).** Add RideNow and toGO as "drive part of the way" options with their published tariffs shown as estimates and a link to each app. Use cases: the trip home after the last bus, a rural leg with no service, and the airport (RideNow ends at both airports).
2. **Park and ride that knows about parking (M, high).** For drivers from villages, plan "drive to a park and ride or a free car park, then bus". Ask Limassol Municipality for its smart parking feed (it will be due on the NAP under MMTIS from 1 Dec 2026, layer 30) and show live free spaces where available.
3. **Honest car comparison (S, high).** For any trip, show what the car really costs: fuel or charging plus parking at the destination (Limassol tariffs once published) versus the bus fare. This is the cheapest nudge toward transit and needs only public tariffs.
4. **EV chargers near stops (S, low).** For EV owners using park and ride, show chargers within walking distance of the stop from the existing NAP dataset.
5. **Approach RideNow Business jointly with employers (M, medium).** RideNow already sells one-invoice business accounts; Aloya's employer reports (layer 29) can recommend "bus plus RideNow for the odd trip" as an alternative to a company car.

### 27.5 Sources

- https://play.google.com/store/apps/details?hl=en_US&id=com.trafi.whitelabel.bvg&listing=carsharing
- https://www.ttsitalia.it/wp-content/uploads/2024/11/Petra-Soderqvist_DG_MOVE.pdf
- https://cyprus-mail.com/2026/10/23/ministry-to-install-94-new-ev-charging-ports-at-e10m-cost
- https://en.philenews.com/local/cyprus-94-fast-ev-charging-points-2028-transport-ministry
- https://www.electrive.com/2026/10/26/cyprus-expands-public-charging-network
- https://cyprus-mail.com/2026/08/06/cypruss-ev-charging-network-and-the-85000-target
- https://www.eac.com.cy/EN/NonRegulatedActivities/chargingstation/Pages/default1.aspx
- https://apps.apple.com/cy/app/ridenow-pro-carsharing/id6743093894
- https://ridenow.tech/short_rides
- https://ridenow.tech/airports
- https://ridenow.tech/business
- https://www.togorent.com/price.html
- https://rentalsincyprus.com/blog
- https://cyprus-mail.com/2026/06/26/limassol-set-to-launch-smart-parking-system-in-early-july
- https://en.politis.com.cy/news/1014847/limassol-to-launch-smart-parking-system-in-early-july
- https://fastforward.com.cy/tech/limassol-signs-eu52m-deal-smart-parking-system
- https://www.easypark.com/en-cy/where-to-park
- Code: src/lib/ev-chargers.functions.ts, src/routes/api/public/park-and-ride.ts (redesign-roam @ 1508f3f)

---

## Layer 28: Tourism (visitors who arrive without a car)

### 28.1 What the best in the world do

- Airports and hotels that want guests on public transport give them one clear answer at the moment of arrival: which bus, where it stops, what it costs and how to pay. The Kapnos and BusCyprus airport guides show how much demand there is for that one answer in Cyprus (layer 23).

### 28.2 Cyprus reality and data

- **Arrivals.** Cyprus recorded 580,889 tourist arrivals in September 2026, the best September on record and up 1.8% on September 2025, but January to September 2026 totalled 3,401,538, down 5.6% (CYSTAT press release, 19 Oct 2026). In September, the UK supplied 31.7% (184,345) and Israel 18.1% (105,249); 84.8% travelled for holidays (CYSTAT; Politis, 20 Oct 2026). Earlier research pass: 4.53M arrivals in 2025.
- **Airports.** Larnaca and Paphos handled a record 13.75 million passengers in 2025, up 12% (Hermes Airports via Routes, 16 Jan 2026). Phase II works will raise capacity by 2027 to 12.4 million a year at Larnaca and 5 million at Paphos (Aviation Week, 19 Jan 2026).
- **Getting from the airport.** Kapnos runs direct shuttles; the public alternative from Larnaca airport to Nicosia is a slower two-ticket trip via route 425 (buscyprus.cy). Kapnos also lists Ayia Napa and Protaras stops (kapnosairportshuttle.com/timetables).
- **Earlier research pass (not re-opened):** Deputy Ministry of Tourism 2027 budget €59.4M with a rural focus; DP World Limassol cruise terminal about 6 km from the centre; the MEDCruise General Assembly in Limassol in 2027.

### 28.3 Aloya today, and its gaps

- Aloya already gathers tourism-relevant signals: hooks/pulse-flights.ts and hooks/pulse-cruises.ts feed the Pulse view, src/routes/api/public/airport.ts serves airport content, and Kapnos is suggested when one end of a trip is at an airport (kapnos.functions.ts header).
- There is no landing page for "I just landed", no hotel-facing product and no cruise-day guide.

### 28.4 Improvements

1. **"Just landed" pages for LCA and PFO (S, high).** One page per airport and destination (Nicosia, Larnaca city, Limassol, Paphos, Ayia Napa, Protaras), with the next Kapnos departure (once permitted), the public bus alternative, fares by payment method, the walk to the stop, and a QR code for printing at arrival halls and car rental desks. Use the existing aloya.cy content pages pattern.
2. **Hotel departures widget (M, high).** The embeddable widget from layer 25, preset for a hotel: nearest stops, next departures, "to the airport" and "to the old town" buttons. Pitch through the Cyprus Hotel Association (earlier research pass) and through individual hotels near frequent routes.
3. **Cruise-day guide for Limassol (S, medium).** On days when hooks/pulse-cruises.ts sees a ship in port, show a cruise guide: terminal to centre by bus, bike or taxi, and back-on-board times. Earlier research pass notes the terminal is about 6 km from the centre and that MEDCruise meets in Limassol in 2027, a natural moment to pitch the port and the operator.
4. **English, Hebrew and other languages (M, medium).** With the UK and Israel together near half of September's arrivals, the visitor pages should be in English first and Hebrew next; Polish and German follow (CYSTAT September shares).
5. **Rural access pitch (M, medium).** If the Deputy Ministry's 2027 focus is rural tourism (earlier research pass), propose village access guides: which villages have any bus, on which days, and what the honest alternatives are (car sharing intercity, layer 27).

### 28.5 Sources

- https://library.cystat.gov.cy/NEW/Tourists_Arrivals%26Residents_Returns-Sep26-EN-191026.pdf
- https://en.politis.com.cy/news/1054728/record-september-for-cyprus-tourism-but-2026-arrivals-still-trail-last-year
- https://cyprus-mail.com/2026/10/19/cyprus-tourism-is-closing-the-gap-though-not-everyone-is-coming-back
- https://www.routesonline.com/airports/8258/hermes-airports/news/299665741/cyprus-airports-reach-all-time-high-passenger-traffic-in-2025/
- https://aviationweek.com/air-transport/airports-networks/sustaining-surge-how-cyprus-airports-are-powering-record-passenger
- https://buscyprus.cy/blog/airport/larnaca-airport-to-nicosia-by-bus
- https://kapnosairportshuttle.com/timetables
- Code: src/routes/api/public/hooks/pulse-flights.ts, hooks/pulse-cruises.ts, airport.ts, src/lib/kapnos.functions.ts (redesign-roam @ 1508f3f)

---

## Layer 29: Employers and universities (commutes with a decision maker)

Individual riders choose one trip at a time. Employers and universities choose for thousands of people at once and can pay for it. They are also where Aloya can earn without touching fares.

### 29.1 What the best in the world do

- **Business accounts with one invoice.** Bolt Business and RideNow Business both sell company accounts with central billing and reports (Bolt PartnerStack listing; ridenow.tech/business). Earlier research pass: Umob sells employer mobility budgets with one invoice and CO2 reports.
- **Campus apps with shuttle times.** Cyprus International University's own app shows upcoming campus bus departures on home screen widgets and checks students on to buses by QR code (ciu.edu.tr, CIU Mobile page). That is the bar a campus expects.

### 29.2 Cyprus reality and data

- **University of Cyprus shuttles.** UCY tendered "provision of transport services for students and staff" (UCY-2026-010-ΥΑΔ), estimated at €300,000 excluding VAT over 36 months, published 19 Jun 2026, closing 21 Jul 2026 (EU Publications Office; Mercell). UCY's HR site says the inter-campus routes (old Kallipoleos buildings to the new campus) run from 28 Sep 2026 and are operated by Lazarou C. Coaches Ltd (ucy.ac.cy/hr bus routes page). These shuttles are not in the national GTFS (earlier research pass; consistent with the UCY page linking to its own PDF timetables).
- **Fares for students.** CPT gives 50% off on a personalised Motion card (publictransport.com.cy fare table, "Personalised Card 50% Discount" column); EMEL reduced fares are 50% of standard and, from 5 Nov 2026, only on a Motion card (limassolbuses.com). Earlier research pass: EMEL accepts student cards from 8 universities; pupils pay €5 a month or €30 a year; UCLan Cyprus is served by route 424.
- **Tax.** Earlier research pass: no Cyprus tax exemption was found for employer-paid transit passes. This was not re-checked.
- **Crowding signal.** Aloya's own day rhythm notes that "UCY and EUC let out around 14:00, expect crowded 121 and 138 across the river" (packages/core/src/today-rhythm.ts line 38).

### 29.3 Aloya today, and its gaps

- No campus or employer product. The only university awareness in code is the crowding hint above.
- UCY shuttles are not in Aloya's data, so a student planning between campuses sees only public buses.

### 29.4 Improvements

1. **Add the UCY shuttles as a supplementary GTFS (M, high).** Transcribe the Fall 2026 to 2027 timetable from UCY's PDF into a small GTFS feed (agency "Lazarou C. Coaches for UCY"), mark it as schedule-only, and merge it into the planner. Ask UCY for permission and for each semester's timetable by email; offer the feed back to UCY and to the NAP.
2. **Campus widget (S, high once layer 25 item 6 exists).** Next shuttle and next public bus from each campus gate, for UCY, EUC, UNIC, UCLan and others, embedded on the university's student portal. Free for universities; it is distribution for Aloya.
3. **Student fare helper (S, medium).** In the fare engine (layer 24), let a rider mark "student" and show the 50% personalised Motion fare with a link to apply, noting EMEL's Motion-only rule from 5 Nov 2026.
4. **Employer commute report (M, high, paid).** For a company: where staff live (postcode level, with consent), which of them have a usable bus within a set walk and time, the car-versus-bus cost and CO2 per person, and the three changes (shift times, a shuttle, a park and ride) that would move the most staff. Sell it as a fixed-fee report; add Bolt Business and RideNow Business referrals for the trips buses cannot do (layers 23 and 27).
5. **Ask the question on tax (S, medium).** Before pitching "give staff a bus pass", get a Cyprus tax adviser's written view on whether employer-paid passes are a taxable benefit. If they are, say so; the CO2 and parking-space savings may still carry the case.

### 29.5 Sources

- https://market.partnerstack.com/page/bolt
- https://ridenow.tech/business
- https://ciu.edu.tr/en/student-life/campus-services/ciu-mobile
- https://op.europa.eu/en/web/public-procurement/procurement-details/-/procurement/7ae10a71-d22d-4250-a22e-d54039c814e2
- https://app.mercell.com/tender/2075555708/
- https://www.ucy.ac.cy/hr/home/bus-routes/
- https://www.publictransport.com.cy/cms/page/cash-tickets
- https://limassolbuses.com/fare-changes-2/
- Code: packages/core/src/today-rhythm.ts (redesign-roam @ 1508f3f)

---

## Layer 30: Government, EU law, funding and open data

### 30.1 What the best in the world do

- **EU rules force data open.** Delegated Regulation (EU) 2024/490, amending 2017/1926 (MMTIS), requires data holders to provide static and dynamic travel data through each country's National Access Point in set formats, and makes NAP APIs for static data "publicly accessible to data users, where relevant subject to registration" (EUR-Lex). The dynamic data timetable runs from 1 Dec 2025 to 1 Dec 2028 (MMTIS implementation handbook, Nov 2024). DG MOVE's summary: by 1 Dec 2025, disruptions, estimated departure and arrival times and the status of access node features; by 1 Dec 2026, parking tariffs and the availability and location of vehicle-sharing and car parking spaces (TTS Italia presentation, Nov 2024). NAPCORE notes 31 Dec 2026 for urban nodes under TEN-T and 31 Dec 2028 for the whole network for access node identifiers (NAPCORE report D2.4.1).
- **Cities as partners.** EIT Urban Mobility funds consortia that include cities; its Strategic Innovation call names "a fourth essential partner: cities" (eiturbanmobility.eu call page).

### 30.2 Cyprus reality and data

- **NAP.** Cyprus's NAP is traffic4cyprus.org.cy, run by the Public Works Department, which publishes GTFS-RT and SIRI for buses (dataset pages) and, via fixcyprus.cy, DATEX datasets including boltstations and electric_vehicle_chargers (Aloya code). data.gov.cy dataset 1069 bundles GTFS, SIRI, a stops CSV and route shapefiles for all operators.
- **Audit and politics.** The Audit Office criticised bus services in October 2026 (Part A sources: Politis, 14 Oct 2026); CPT pushed back and said it had already moved on (Cyprus Mail, 15 Oct 2026). On 30 Oct 2026 the Minister conceded gaps in timetables at stops, payment and intercity booking (Sigmalive; info.cy). CPT's chief has argued that bus priority on the Nicosia motorway shows buses can beat cars at peak (CBN, 27 Oct 2026).
- **Funding open now (all times CET):**
  - EIT Urban Mobility Financial Support to Startups: up to €2.5m per startup, taking equity (target 5 to 10%), only for startups in an active pre-seed, seed or Series A round with private investors; cut-off 4 on 16 Nov 2026 17:00, then 11 Jan 2027 and 12 Apr 2027 (eiturbanmobility.eu call page; grant-grants.com summary, 21 Oct 2026).
  - EIT Urban Mobility SME Market Expansion 2027: up to €60,000 for an SME with at least 3 full-time staff and a solution at TRL 7 or above with previous customers; closes 1 Dec 2026 17:00 (eit.europa.eu; eiturbanmobility.eu, 9 Oct 2026).
  - EIT Urban Mobility Strategic Innovation Open Call: up to €2m per project, up to 65% of eligible costs, consortium of at least two independent organisations from two different EU or associated countries; 4th cut-off 28 Jan 2027 17:00, 5th 3 Jun 2027; about €60m over 2026 to 2028 (call manual v5, 21 Sep 2026; TrustList, 26 Oct 2026; RIC Gabrovo summary).
  - Earlier research pass: the RIF Pre-Seed call closed on 11 Sep 2026; CIVITAS is another route; an Urban Futures Symposium is on 26 to 27 Nov 2026.

### 30.3 Aloya today, and its gaps

- Aloya consumes NAP data well (GTFS-RT relay in workers/gtfs-relay, DATEX for traffic, Bolt zones and EV chargers) and republishes a GBFS merge (layer 22). It has no formal relationship with the Public Works Department, the Ministry or any municipality.
- It does not meet the eligibility of the two startup-focused EIT calls today as far as this pass could establish: the startup call needs a live equity round with private investors, and the SME call needs 3 full-time staff and paying customers at TRL 7.

### 30.4 Improvements

1. **Offer the NAP a free data quality service (S, high).** Aloya already computes reliability, ghost buses and stop position errors (Part A). Send the Public Works Department a monthly data quality note (feed outages, stale vehicles, stops off by more than 50 m) with no strings attached. This builds the relationship every other item here depends on.
2. **Use the 1 Dec 2026 MMTIS deadline (S, high).** Write to Limassol and Nicosia municipalities and to Bolt, Electra, RideNow and EasyPark: parking availability and tariffs and vehicle-sharing availability are due on the NAP from 1 Dec 2026; Aloya can help convert and validate (GBFS for vehicles, DATEX for parking) and will display the data. Be careful to describe the obligation accurately: the Regulation covers existing digital machine-readable data via the NAP (NAPCORE FAQ), it does not force anyone to create new data.
3. **Target the Strategic Innovation call, 28 Jan 2027, with a city (L, very high).** This is the best fit: it funds deployment with cities, up to €2m, and requires a consortium from two countries. Build a consortium of a Cyprus municipality (Nicosia or Limassol), Aloya, a Cyprus university and an operator or tech partner from another EU country, around one measurable goal from this book (for example, location-aware alerts plus mid-trip micromobility on two corridors, with ridership and car-trip reduction measured). Aloya must budget its 35% co-funding share.
4. **Skip the 16 Nov 2026 startup cut-off unless a round is live (S, medium).** It needs an active priced round with private investors. If one is opened for Aloya, the 11 Jan 2027 cut-off is the next chance.
5. **Find the city partner in November (S, high).** Use the Urban Futures Symposium on 26 to 27 Nov (earlier research pass; date not re-checked) and direct emails to municipal mobility officers. Given Samuel's stated preference for written routes, lead with a two-page written proposal and the data quality note from item 1.
6. **Fix the trust issues first (S, very high).** No ministry, municipality or EU evaluator will partner with a product that logs in to JCC with users' passwords or reads a private operator's booking API without permission. Layers 23, 24 and 25 items come first.

### 30.5 Sources

- https://eur-lex.europa.eu/eli/reg_del/2024/490/oj
- https://transport.ec.europa.eu/document/download/0b75db16-35b1-41df-8229-5c8abfec534d_en?filename=MMTIS_implementation_handbook.pdf
- https://www.ttsitalia.it/wp-content/uploads/2024/11/Petra-Soderqvist_DG_MOVE.pdf
- https://www.napcore.eu/documents/D2.4.1_Mapping%20access%20nodes%20identifiers%20MS_final.pdf
- https://napcore.eu/wp-content/uploads/2025/04/NAPCORE-WG5_Communication-Package_FAQs-on-the-Delegated-Regulations.pdf
- https://traffic4cyprus.org.cy/en/dataset/publictransportrealtime_gtfs_rt
- https://www.data.gov.cy/en/dataset/1069
- https://en.politis.com.cy/news/cy-news/1051591/bus-report-exposes-why-commuters-are-turning-away-from-public-transport
- https://cyprus-mail.com/2026/10/15/cyprus-public-transport-dismisses-audit-report-says-it-has-already-moved-on
- https://en.sigmalive.com/cyprus-plans-improvements-to-bus-services-and-ticketing-system/
- https://www.cbn.com.cy/article/135223/felipe-cosmen-priority-measures-and-new-tech-will-encourage-more-people-to-take-the-bus-in-cyprus-video
- https://www.eiturbanmobility.eu/call-for-proposals/financial-support-to-startups-open-call-3
- https://grant-grants.com/news/tpost/eit-urban-mobility-financial-support-startups
- https://www.eit.europa.eu/our-activities/opportunities/sme-market-expansion-open-call-2027
- https://www.eiturbanmobility.eu/sme-market-expansion-open-call-2027/
- https://www.eiturbanmobility.eu/call-for-proposals/strategic-innovation-open-call
- https://www.eiturbanmobility.eu/wp-content/uploads/2026/09/Strategic-Innovation-Call-Manual_v5_21092026_final.pdf
- https://trustlist.uk/news/eit-urban-mobility-open-call-up-to-eur-2m-per-consortium-next-cut-off-28-january-2027
- https://ric-gabrovo.com/wp6-eit-urban-mobility/
- Code: workers/gtfs-relay, src/lib/bolt-scooter.functions.ts, src/lib/ev-chargers.functions.ts, src/routes/api/public/gbfs[.]json.ts (redesign-roam @ 1508f3f)

---

## Part C summary: the top ten, in order

| # | Action | Layer | Effort | Impact |
|---|---|---|---|---|
| 1 | Turn off the JCC password proxy (public wallet endpoint first), keep a manual balance mode, label anything left as unofficial, then ask the Ministry and JCC for read-only partner access during ABT | 24 | S then M | Very high |
| 2 | Resolve the licence: code proprietary, open data outputs under CC BY 4.0, API under written terms; correct the MIT note in memory | 25 | S | Very high |
| 3 | API keys, per-key and per-IP quotas, restricted CORS on plan, places-autocomplete, walk-directions, tts, stt, parse-trip-intent, wallet/ocr, kapnos and wallet; budget caps on Mapbox, ElevenLabs, OpenAI and Gemini | 25 | M | Very high |
| 4 | Join the Bolt Business referral scheme; relabel the Bolt button until Bolt issues a partner id | 23 | S | Medium |
| 5 | Write to Kapnos for permission, a referral deal or GTFS; meanwhile cache, stop the public proxy and stop showing seat counts | 23 | S | High |
| 6 | Fix the GBFS merge (start_date, purchase_url, license_url, operator line), switch Nextbike to GBFS, list in the Mobility Database | 22, 26 | S | High |
| 7 | Ask Electra and Bolt for GBFS citing MMTIS 1 Dec 2026; add RideNow and toGO deep links | 22, 27 | S to M | High |
| 8 | UCY shuttles as supplementary GTFS; hotel and campus departures widget; "just landed" airport pages | 28, 29 | M | High |
| 9 | Publish and document the MCP server and deep links | 25 | S | Medium |
| 10 | Compete on trust (ETA confidence, honest fallbacks); prepare the EIT Strategic Innovation bid for 28 Jan 2027 with a Cyprus city | 26, 30 | L | Very high |

## What this part could not establish

- Whether the MCP server at /mcp is live in production.
- Apple Maps transit coverage in Cyprus.
- Whether Moovit Pay works in Cyprus or is template text on Moovit's pages.
- The licence of Nextbike's nextbike-live.json endpoint (as opposed to its GBFS feed).
- Whether the e-scooter impoundment decree is in force (latest source found describes it as a draft in consultation until 26 Sep 2026).
- Whether the JCC integration breaches JCC's terms or any law. This needs a lawyer; the recommendation to switch it off does not depend on the answer.
- Facts marked "earlier research pass" were carried over from part-c-raw.md without their URLs and were not re-opened.
