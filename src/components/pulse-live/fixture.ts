// Dev and QA only: /pulse?fx=cards swaps the live signal bundle for a fixed
// one, so the rarer cards (warning, traffic, news, events, football, cruise,
// sea, flights, air) can be checked on any day. Nothing links to it and it
// changes nothing for riders who do not type the flag.

import { useEffect, useState } from "react";
import type { PulseLiveBundle } from "@/lib/pulse-live.functions";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Nicosia" }).format(new Date());
}

function at(hhmm: string): string {
  // Kick-off later today on the island clock (Cyprus is UTC+2 in winter).
  return `${todayIso()}T${hhmm}:00+02:00`;
}

export function buildPulseFixture(): PulseLiveBundle {
  const now = new Date().toISOString();
  const d = todayIso();
  const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  return {
    generatedAt: Math.floor(Date.now() / 1000),
    focus: { id: "limassol", label: "Limassol", labelEl: "Λεμεσός", lat: 34.68, lng: 33.04, coastal: true },
    weather: null,
    marine: {
      zone: "limassol",
      city: "Limassol",
      waveHeightM: 0.6,
      wavePeriodS: 5,
      swellHeightM: 0.3,
      seaTempC: 24,
      beachVerdict: "good",
      summary: "Gentle swell and warm water at the town beaches this afternoon.",
      observedAt: now,
    },
    air: {
      zone: "limassol",
      city: "Limassol",
      europeanAqi: 64,
      pm10: 58,
      pm25: 21,
      band: "moderate",
      dustAlert: true,
      summary: "Light dust in the air until the evening. Sensitive riders may want a mask.",
    },
    metWarnings: {
      count: 2,
      confidence: "high",
      warnings: [
        {
          level: "yellow",
          kind: "Thunderstorms",
          area: "Troodos",
          startsAt: now,
          endsAt: null,
          summary: "Thunderstorms and heavy showers in the mountains from 14:00 to 20:00.",
        },
      ],
    },
    cruises: {
      date: d,
      count: 2,
      totalPassengers: 4200,
      summary: "",
      ships: [
        { shipName: "MSC Lirica", line: "MSC", arrival: "08:00", departure: "17:00", passengers: 2200 },
        { shipName: "Celestyal Journey", line: "Celestyal", arrival: "09:30", departure: "18:30", passengers: 2000 },
      ],
    },
    flights: [
      { airport: "LCLK", city: "Larnaca", arrivalsNext60: 7, departuresNext60: 5, arrivals: [], departures: [], summary: "" },
      { airport: "LCPH", city: "Paphos", arrivalsNext60: 2, departuresNext60: 3, arrivals: [], departures: [], summary: "" },
    ],
    news: {
      count: 3,
      sources: ["Cyprus Mail", "in-cyprus"],
      fetchedAt: now,
      items: [
        { title: "New bus shelters with live arrival screens go up along Makarios Avenue", url: "https://cyprus-mail.com/", source: "Cyprus Mail", category: "local", publishedAt: ago(25) },
        { title: "Limassol marina hosts this weekend's sailing regatta", url: "https://in-cyprus.philenews.com/", source: "in-cyprus", category: "local", publishedAt: ago(70) },
        { title: "Larnaca airport expects a busy autumn half-term week", url: "https://cyprus-mail.com/", source: "Cyprus Mail", category: "travel", publishedAt: ago(140) },
      ],
    },
    events: {
      count: 3,
      events: [
        { title: "Jazz evening at the Old Port", city: "Limassol", venue: "Old Port", startDate: d, endDate: d, category: "music", url: null },
        { title: "Autumn wine festival", city: "Omodos", venue: "Village square", startDate: d, endDate: d, category: "wine", url: null },
        { title: "Modern Cypriot painting exhibition", city: "Nicosia", venue: "Leventis Gallery", startDate: "2026-10-01", endDate: "2026-11-30", category: "art", url: null },
      ],
    },
    fixtures: {
      count: 2,
      fixtures: [
        { home: "Omonia", away: "APOEL", kickoff: at("19:00"), venue: "GSP Stadium", city: "Nicosia", competition: "Cyprus First Division" },
        { home: "AEL", away: "Apollon", kickoff: at("20:00"), venue: "Alphamega Stadium", city: "Limassol", competition: "Cyprus First Division" },
      ],
    },
    traffic: {
      zone: "limassol",
      count: 4,
      highest: "medium",
      observedAt: now,
      incidents: [
        { id: "t1", kind: "roadworks", severity: "medium", road: "A1", headline: "Roadworks on the A1 near the Ypsonas exit, one lane open", lat: null, lng: null, zone: "limassol", validFrom: now, validTo: null },
        { id: "t2", kind: "congestion", severity: "low", road: "Makarios III Avenue", headline: "Slow traffic on Makarios III Avenue towards the Old Port", lat: null, lng: null, zone: "limassol", validFrom: now, validTo: null },
        { id: "t3", kind: "closure", severity: "low", road: "Anexartisias", headline: "Anexartisias Street closed to cars for the market", lat: null, lng: null, zone: "limassol", validFrom: now, validTo: null },
      ],
    },
  } as PulseLiveBundle;
}

/** The fixture bundle when the page was opened with ?fx=cards, else null. */
export function usePulseFixture(): PulseLiveBundle | null {
  const [fx, setFx] = useState<PulseLiveBundle | null>(null);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("fx") === "cards") setFx(buildPulseFixture());
    } catch {
      // no window: nothing to swap
    }
  }, []);
  return fx;
}
