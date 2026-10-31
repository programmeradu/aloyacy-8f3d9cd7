# Part D seed (layers 31-40, r50-d-data-ai first run; the workspace was down, so this was taken from its report)

Top 10:
1. L37 fares bug: packages/core/src/boarding-pay.ts shows Nicosia/Larnaca prices (€2.00 Motion, €2.70 cash, night €3.50/€4.70) on Limassol, Paphos and Famagusta buses, which charge flat singles. EMEL Limassol goes to €2.50 cash from 5 Nov 2026 (eWallet stays €2); night €4, day €7. docs/TRUTH_PLAN.md and the pitch book still say €1.80/€2.40, now stale.
2. L33 AI planner: ai-planner.functions.ts only has Gemini, OpenAI and the Lovable gateway. Add Groq gpt-oss-20b, with Cloudflare Workers AI as fallback (free 10k units/day). Add a quota guard (cache, regex parser first; Groq free tier 1K req/day). The prompt hard-codes summer time +180 min, wrong since 25 Oct; use Asia/Nicosia. Move to a tool-calling assistant where every number comes from a tool (GPT-4 scored 0.6% on TravelPlanner).
3. L38 safety: there is no SOS surface. ShareEtaButton.tsx makes a public link that stops only on long-press. Add 112/1440, auto-expiry on arrival or after 3 h, and an "arrived safely" message to watchers.
4. L36 heat: open-meteo.server.ts fetches current conditions only. Add hourly feels-like, UV, dust and PM10, a wait penalty at stops without shelter, and the MeteoAlarm red-warning banner. Open-Meteo free tier is non-commercial only.
5. L34 feed QA: run the MobilityData GTFS validator nightly; track match rate, feed age and frozen buses per operator. Add bias correction only if the nightly test shows it beats the operator.
6. L32 crowding: crowd.functions.ts infers load from rider phones and is usually silent. Add a one-tap seats/standing/packed report and a typical-busyness pattern; show how many reports and how long ago.
7. L39 offline: timetables cache (offline-schedules.ts, IndexedDB), but map and planning don't. Run raptor-core in the browser, add an offline Cyprus map, auto-download on Wi-Fi, and a "scheduled times" banner.
8. L35 B2G: quarterly operator report card as a PDF on EU SUMP indicators. Swiftly lists at about $61.6k/yr for 20 buses. Hooks: the ministry's AI in Government challenge, SUMP and recovery-fund money, the €41.9M smart traffic lights tender.
9. L40 languages: merge i18n.ts (EN/EL) with roam-i18n.ts (37 KB). Build RTL support. Order: Hebrew (13% of tourists), Russian, then Arabic, Ukrainian, Turkish. Machine translation plus a native reviewer; official stop names stay. App screens yes, SEO pages no.
10. L31 open data: Mapillary street lights and benches (lit night routes, stop seating), MeteoAlarm, Met Office stations, DLI air quality, and a /data attribution page.

Already good: per-operator ghost-trip tuning (ghost-trips.ts); nightly prediction logging, including whether Aloya beats the operator ETA; rider GPS sanity checks and reputation; rider-tapped stop conditions; AI extracts intent only and RAPTOR plans.
