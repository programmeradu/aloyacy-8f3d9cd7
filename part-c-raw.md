# Part C raw findings (layers 21-30, r50-c-integrations; the workspace was down, so this is pasted from its report; reshape to BRIEF structure at compile)

## Repo check (redesign-roam)
- Maps: Google Maps Platform (Routes, Places, Street View) via GOOGLE_MAPS_* keys.
- Bus data: static GTFS bundled, plus GTFS-RT through the workers/gtfs-relay raw TCP relay.
- Supabase self-hosted, Resend, web push and Expo push, Stripe (Aloya Pro), Google Wallet passes.
- Other sources: DATEX traffic, Mapillary, ElevenLabs, Gemini/OpenAI/Bedrock.
- LICENSE/README on this branch say proprietary, all rights reserved, evaluation only. Memory says MIT. Resolve.
- Kapnos: undocumented API kapnos.ecoachmanager.com/coachtrip/api/trip-type-all, plus a deep link. No agreement.
- JCC: jcc.functions.ts signs in to apihub.jcc.com.cy with the user's password, spoofs jccsmart.com origin/referer/UA, and reads the last 30 transactions. Biggest legal and trust risk.
- Bolt: e-scooter parking zones from NAP DATEX boltstations (CC-BY, Nicosia only). AppsFlyer OneLink pid=aloya, self-chosen, earns nothing.
- Nextbike: GBFS CC0, deep link app.nextbike.net/station?id=.
- EV chargers: NAP DATEX electric_vehicle_chargers.
- app.aloya.cy/api/public/gbfs.json merges Nextbike and Bolt. Wrong start_date 2024-01-01, no license_id.
- src/lib/mcp "aloya-mcp" v0.2.0: search_stops, get_stop_arrivals, watch_stop_arrivals, plan_trip.
- About 60 /api/public routes with CORS *, no keys or rate limits. partners/apply.ts exists.

## L21 MaaS lessons
- MaaS Global (Whim): bankrupt 14 Mar 2024 after about €75.5M raised. 2022: €3.8M revenue, €9.3M loss, about 10k monthly users in Helsinki. Umob bought it in Apr 2024 (ITS International, 21 Aug 2024).
- Umob: provider fee per booking at the same price to the user, plus employer budgets with one invoice and CO2 reports.
- Ummadum: bankrupt 4 Dec 2025.
- Jelbi (BVG on Trafi): the agency is the integrator. About 400 hubs, 1.2M+ downloads.
- Citymapper Pass: closed 18 Jun 2023. Via acquired Citymapper.
- Transit: Royale tier sponsored by agencies.
- SBB EasyRide (FAIRTIQ): fastest-growing sales channel.
- Lesson: no ticket resale or consumer bundles. Do referrals and B2B, stay capital-light. Every hand-off today earns nothing.

## L22 Micromobility
- Nextbike: GBFS v2.3, CC0, 60 s refresh. Limassol, Paphos, Nicosia, Larnaca, Famagusta. Integrated.
- Bolt scooters: from €0.15/min. No GBFS; only the NAP zones. Integrated, Nicosia only.
- Electra (electra.space): e-mopeds from €0.22/min, e-bikes, e-scooters. Limassol, Larnaca, Nicosia. No public feed. Not integrated.
- E-scooter law tightened May 2026; 30-90 day impoundment from Sep 2026.
- Do next: ask Electra and Bolt for GBFS, citing MMTIS. Add license_id and fix start_date.

## L23 Ride-hail and taxi
- Bolt dominates. Uber left in 2016. Others: inDrive, CabCY, Alfa, VIPS, Yango, Travel & Express shared intercity taxis.
- No public Bolt booking API. Options: Bolt Business Ride Booker via Iomob, the PartnerStack affiliate (€150 per company plus €50 at 15 rides), and Bolt in ChatGPT (29 Jul 2026).
- Kapnos: €9 LCA-Nicosia, on Google Maps since Feb 2026, on Klook. No affiliate scheme.
- Do next: join the Bolt Business affiliate scheme. Write to Kapnos (Marios Socratous) for API permission, a referral deal or a GTFS feed.

## L24 Ticketing and payments
- Fares: CPT (from 3 Aug 2026) €2.70 cash or €2.00 Motion single, 30-day pass €66.90. EMEL (from 5 Nov 2026) €2.50, eWallet €2.00. Intercity cash only, €5-8.
- Motion: 82.6% of CPT riders use it. CPT carried 12.3M passengers in 2025 and 8.78M trips Jan-Aug 2026 (+14.5%), 63% on 30-day passes.
- GMV is building account-based ticketing; EMV pilot in Famagusta. Minister (30 Oct 2026): card payment to spread; online intercity booking under study.
- Do next: label the JCC feature unofficial, stop spoofing, seek read-only partner access during the ABT rollout. Don't sell tickets.
- Sources: cbn.com.cy 16 Sep 2026, alphanews.live 15 Oct 2026.

## L25 Others integrating Aloya
- TOMP-API v2.0 adoption is weak. MDS 2.1 is regulator-facing. Bus open data is CC-BY-4.0 (Transitland f-intercity~buses~cy).
- Do next: resolve the licence. Add API keys and rate limits, and restrict CORS on costly routes (plan, places-autocomplete, streetview, tts). Publish the MCP server, document deep links, offer an embeddable departures widget, show attribution.

## L26 Google, Apple, Moovit, Transitous
- EMEL on Google about Feb 2026. Kapnos on Google Feb 2026 (Igor Akimov, gtfs.guru). Coverage still called patchy.
- Moovit covers NPT, EMEL, OSEA and Intercity with real time. Moovit Pay for Nicosia is advertised, unverified.
- Transitous: Cyprus partial; realtime added in PR #1427. Free API only for non-commercial open source.
- Apple Maps: not verified.
- Indie field: BusCyprus, Cyprus Transport, info.cy/buses, cyprusbus.app, buscyprus.com, BusAPP, cyprustransport.com.cy, CPT Pame app (15 Sep 2026).
- Takeaway: live arrivals are a commodity. The edge is ETA trust and Cyprus-specific multimodal coverage.
- Do next: contribute to Transitous, list in the Mobility Database.

## L27 EV, car sharing, rental, parking
- About 380 public chargers, with about 100 more planned (electrive, 26 Oct 2026); Cyprus Mail said about 250 at the start of 2026. EAC e-charge, EV Power, Hubject.
- Car sharing: RideNow (4 cities plus airports, €1 plus €0.07/min plus €0.27/km; airport fee €19 or €25), toGO (35 cars from €0.29/min), CAROL (P2P). None integrated.
- Parking: EasyPark (Limassol 2026, commercial API). Limassol smart parking (€5.17M, 2,500 spaces, from Jul 2026). Smart Parking Nicosia (Yodiwo/JCC). Find2Park. Larnaca plate recognition. Paphos sensors.
- Do next: deep links to RideNow and toGO. Ask Limassol for its parking feed.

## L28 Tourism
- 4.53M arrivals in 2025. Jan-Sep 2026: 3.40M (-5.6%); Sep 2026 a record 580,889. UK 31.7%, Israel 18.1%, 84.8% holiday. Hermes 13.75M passengers in 2025.
- Deputy Ministry of Tourism 2027 budget €59.4M, rural focus. DP World Limassol cruise terminal 6 km from the centre; MEDCruise GA in Limassol 2027.
- Do next: airport to hotel page with QR codes, hotel widget for the Cyprus Hotel Association, cruise guide, rural access pitch.

## L29 Employers and universities
- UCY tender UCY-2026-010-HAD (€300k, closed 21 Jul 2026). Inter-campus shuttles by Lazarou Coaches from 28 Sep 2026, not in GTFS.
- EMEL accepts student cards from 8 universities. Pupils €5/month or €30/year. University students 50% off with a personalised Motion card. UCLan served by route 424.
- No Cyprus tax exemption found for employer passes.
- Do next: add the UCY shuttles, campus widget, employer CO2 and commute reports.

## L30 Government, EU, open data
- MMTIS 2024/490 NAP deadlines: 1 Dec 2025, 1 Dec 2026, 1 Dec 2028.
- EIT UM startups (16 Nov 2026 17:00 CET; needs a live equity round). SME Market Expansion (1 Dec 2026; needs 3 FTE and TRL7+). Strategic Innovation (€18M; 28 Jan 2027 and 3 Jun 2027; best fit, with a city partner). RIF Pre-Seed closed 11 Sep 2026. CIVITAS.
- Audit Office criticism Oct 2026; CPT says use is up 14.5%.
- Do next: Urban Futures Symposium 26-27 Nov to find a city partner.

## Top 10
1. Fix the JCC integration. 2. Resolve the licence. 3. API keys, rate limits, CORS. 4. Bolt affiliate and Kapnos referral. 5. Kapnos agreement. 6. GBFS fixes plus Mobility Database. 7. Electra, RideNow, toGO. 8. UCY shuttles, hotel and campus widget. 9. Publish MCP, deep-link docs. 10. Win on trust; EIT Jan 2027 with a city.
Unverified: MCP live, Apple Maps, Moovit Pay.
