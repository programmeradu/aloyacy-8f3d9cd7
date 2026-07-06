// Pulse — live signals stack: weather warnings, news, sea, air, traffic,
// cruises, flights, events and fixtures.

import { useEffect, useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import type {
  PulseLiveBundle,
  MarinePayload,
  AirPayload,
  NewsPayload,
  TrafficLivePayload,
  CruisesPayload,
  FlightsPayload,
  EventsPayload,
  FixturesPayload,
  MetWarningsPayload,
} from "@/lib/pulse";
import {
  DISPLAY,
  DISPLAY_MED,
  SANS,
  SANS_BOLD,
  MONO,
  EYEBROW,
  Eyebrow,
  SignalCard,
  StatFigure,
  relativeAgo,
  formatShortDate,
  formatKickoff,
} from "./kit";

export function LiveSignals({ bundle }: { bundle: PulseLiveBundle }) {
  const hasAny =
    bundle.news ||
    bundle.marine ||
    bundle.air ||
    (bundle.metWarnings && bundle.metWarnings.count > 0) ||
    (bundle.cruises && bundle.cruises.count > 0) ||
    bundle.flights.length > 0 ||
    (bundle.events && bundle.events.count > 0) ||
    (bundle.fixtures && bundle.fixtures.count > 0) ||
    (bundle.traffic && bundle.traffic.count > 0);

  if (!hasAny) return null;

  return (
    <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
      <Eyebrow>Live signals · {bundle.focus.label}</Eyebrow>

      <View style={{ gap: 12, marginTop: 12 }}>
        {bundle.metWarnings && bundle.metWarnings.count > 0 && (
          <MetWarningCard payload={bundle.metWarnings} />
        )}
        {bundle.news && bundle.news.count > 0 && <NewsCard payload={bundle.news} />}
        {bundle.marine && bundle.focus.coastal && (
          <MarineCard payload={bundle.marine} city={bundle.focus.label} />
        )}
        {bundle.air && <AirCard payload={bundle.air} city={bundle.focus.label} />}
        {bundle.traffic && bundle.traffic.count > 0 && (
          <TrafficCard payload={bundle.traffic} city={bundle.focus.label} />
        )}
        {bundle.cruises && bundle.cruises.count > 0 && (
          <CruiseCard payload={bundle.cruises} />
        )}
        {bundle.flights.length > 0 && <FlightsCard payloads={bundle.flights} />}
        {bundle.events && bundle.events.count > 0 && <EventsCard payload={bundle.events} />}
        {bundle.fixtures && bundle.fixtures.count > 0 && (
          <FixturesCard payload={bundle.fixtures} />
        )}
      </View>
    </View>
  );
}

export function MetWarningCard({ payload }: { payload: MetWarningsPayload }) {
  const worst = payload.warnings[0];
  if (!worst) return null;
  const tone =
    worst.level === "red" ? "#B23A2E" : worst.level === "orange" ? palette.ochre : "#B69233";
  return (
    <SignalCard tone={tone} kicker={`Weather warning · ${worst.level.toUpperCase()}`}>
      <Text
        style={{
          fontFamily: DISPLAY_MED,
          fontSize: 17,
          lineHeight: 22,
          color: palette.ink,
        }}
      >
        {worst.kind} — {worst.area}
      </Text>
      <Text
        style={{ marginTop: 6, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}
      >
        {worst.summary}
      </Text>
      {payload.count > 1 && (
        <Text
          style={{
            marginTop: 8,
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: palette.inkSoft,
          }}
        >
          + {payload.count - 1} more warning{payload.count > 2 ? "s" : ""}
        </Text>
      )}
    </SignalCard>
  );
}

export function NewsCard({ payload }: { payload: NewsPayload }) {
  const [i, setI] = useState(0);
  const items = payload.items.slice(0, 6);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [items.length]);
  const item = items[i];
  if (!item) return null;
  return (
    <SignalCard tone={palette.aegeanDeep} kicker={`News · ${item.source}`} image={assets.pulse_news_kafenion}>
      <Pressable
        onPress={async () => {
          await Haptics.selectionAsync();
          Linking.openURL(item.url).catch(() => {});
        }}
      >
        <Text
          style={{
            fontFamily: DISPLAY_MED,
            fontSize: 17,
            lineHeight: 22,
            color: palette.ink,
          }}
        >
          {item.title}
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: palette.inkSoft,
          }}
        >
          {relativeAgo(item.publishedAt)} · Tap to read
        </Text>
      </Pressable>
      {items.length > 1 && (
        <View style={{ flexDirection: "row", gap: 4, marginTop: 12 }}>
          {items.map((_, k) => (
            <View
              key={k}
              style={{
                width: 16,
                height: 3,
                borderRadius: 2,
                backgroundColor: k === i ? palette.aegeanDeep : palette.line,
              }}
            />
          ))}
        </View>
      )}
    </SignalCard>
  );
}

export function MarineCard({ payload, city }: { payload: MarinePayload; city: string }) {
  const verdictTone =
    payload.beachVerdict === "great"
      ? palette.olive
      : payload.beachVerdict === "good"
      ? palette.aegeanDeep
      : palette.ochre;
  return (
    <SignalCard tone={palette.aegeanDeep} kicker={`Sea · ${city}`} image={assets.pulse_sea_card}>
      <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-end" }}>
        <StatFigure
          value={payload.seaTempC != null ? Math.round(payload.seaTempC).toString() : "—"}
          unit="°C"
          label="Water"
        />
        <StatFigure
          value={payload.waveHeightM != null ? payload.waveHeightM.toFixed(1) : "—"}
          unit="m"
          label="Waves"
        />
      </View>
      {payload.beachVerdict && (
        <Text
          style={{
            marginTop: 12,
            fontFamily: EYEBROW,
            fontSize: 10,
            letterSpacing: 1.8,
            color: verdictTone,
            textTransform: "uppercase",
          }}
        >
          Beach verdict · {payload.beachVerdict}
        </Text>
      )}
      <Text
        style={{ marginTop: 4, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}
      >
        {payload.summary}
      </Text>
    </SignalCard>
  );
}

export function AirCard({ payload, city }: { payload: AirPayload; city: string }) {
  const bandColor =
    payload.band === "good"
      ? palette.olive
      : payload.band === "fair"
      ? palette.aegeanDeep
      : payload.band === "moderate"
      ? "#B69233"
      : payload.band === "poor"
      ? palette.ochre
      : "#B23A2E";
  return (
    <SignalCard tone={bandColor} kicker={`Air · ${city}`} image={assets.pulse_sky_card}>
      <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-end" }}>
        <StatFigure
          value={payload.europeanAqi != null ? Math.round(payload.europeanAqi).toString() : "—"}
          unit="AQI"
          label="European"
        />
        <StatFigure
          value={payload.pm10 != null ? Math.round(payload.pm10).toString() : "—"}
          unit="µg"
          label="PM10"
        />
      </View>
      {payload.band && (
        <Text
          style={{
            marginTop: 12,
            fontFamily: EYEBROW,
            fontSize: 10,
            letterSpacing: 1.8,
            color: bandColor,
            textTransform: "uppercase",
          }}
        >
          {payload.dustAlert ? "Dust advisory · " : ""}
          {payload.band}
        </Text>
      )}
      <Text
        style={{ marginTop: 4, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}
      >
        {payload.summary}
      </Text>
    </SignalCard>
  );
}

export function TrafficCard({ payload, city }: { payload: TrafficLivePayload; city: string }) {
  const tone =
    payload.highest === "high" ? "#B23A2E" : payload.highest === "medium" ? palette.ochre : palette.olive;
  const list = payload.incidents.slice(0, 3);
  // Mirror web PulseLiveSection: pick a variant photo per dominant incident kind.
  const dominantKind = list[0]?.kind?.toLowerCase() ?? "";
  const trafficImg = dominantKind.includes("roadwork")
    ? assets.pulse_traffic_roadworks
    : dominantKind.includes("closure") || dominantKind.includes("closed")
    ? assets.pulse_traffic_closure
    : dominantKind.includes("congest") || dominantKind.includes("jam")
    ? assets.pulse_traffic_congestion
    : assets.pulse_traffic_card;
  return (
    <SignalCard tone={tone} kicker={`Roads · ${city}`} image={trafficImg}>
      <Text style={{ fontFamily: DISPLAY_MED, fontSize: 17, lineHeight: 22, color: palette.ink }}>
        {payload.count} live incident{payload.count === 1 ? "" : "s"}
      </Text>
      <View style={{ marginTop: 10, gap: 8 }}>
        {list.map((i) => (
          <View key={i.id}>
            <Text
              style={{
                fontFamily: EYEBROW,
                fontSize: 9.5,
                letterSpacing: 1.8,
                color: tone,
                textTransform: "uppercase",
              }}
            >
              {i.kind} · {i.severity}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: SANS_BOLD, fontSize: 13.5, color: palette.ink }}>
              {i.road ?? "Unnamed road"}
            </Text>
            <Text style={{ marginTop: 1, fontFamily: SANS, fontSize: 12.5, color: palette.inkSoft }}>
              {i.headline}
            </Text>
          </View>
        ))}
      </View>
    </SignalCard>
  );
}

export function CruiseCard({ payload }: { payload: CruisesPayload }) {
  return (
    <SignalCard tone={palette.aegeanDeep} kicker="Port · Limassol" image={assets.pulse_cruise_card}>
      <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-end" }}>
        <StatFigure value={String(payload.count)} unit="ships" label="Today" />
        <StatFigure
          value={payload.totalPassengers.toLocaleString()}
          unit=""
          label="Passengers"
        />
      </View>
      <Text
        style={{ marginTop: 12, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: palette.inkSoft }}
      >
        {payload.summary}
      </Text>
    </SignalCard>
  );
}

export function FlightsCard({ payloads }: { payloads: FlightsPayload[] }) {
  return (
    <SignalCard tone={palette.aegeanDeep} kicker="Airports · Next hour">
      <View style={{ gap: 14 }}>
        {payloads.map((p) => (
          <View key={p.airport}>
            <Text style={{ fontFamily: SANS_BOLD, fontSize: 13.5, color: palette.ink }}>
              {p.city}
            </Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
              <StatFigure value={String(p.arrivalsNext60)} unit="" label="Arrivals" small />
              <StatFigure value={String(p.departuresNext60)} unit="" label="Departures" small />
            </View>
            <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 12.5, color: palette.inkSoft }}>
              {p.summary}
            </Text>
          </View>
        ))}
      </View>
    </SignalCard>
  );
}

export function EventsCard({ payload }: { payload: EventsPayload }) {
  const list = payload.events.slice(0, 3);
  return (
    <SignalCard tone={palette.ochre} kicker={`Events · ${payload.count} on`}>
      <View style={{ gap: 10 }}>
        {list.map((e, i) => (
          <View key={i}>
            <Text style={{ fontFamily: DISPLAY_MED, fontSize: 15, color: palette.ink }}>
              {e.title}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: SANS, fontSize: 12.5, color: palette.inkSoft }}>
              {[e.city, e.venue].filter(Boolean).join(" · ")}
              {e.startDate ? ` · ${formatShortDate(e.startDate)}` : ""}
            </Text>
          </View>
        ))}
      </View>
    </SignalCard>
  );
}

export function FixturesCard({ payload }: { payload: FixturesPayload }) {
  const list = payload.fixtures.slice(0, 3);
  return (
    <SignalCard tone={palette.olive} kicker="Football · Today">
      <View style={{ gap: 10 }}>
        {list.map((f, i) => (
          <View key={i}>
            <Text style={{ fontFamily: DISPLAY_MED, fontSize: 15, color: palette.ink }}>
              {f.home} v {f.away}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: SANS, fontSize: 12.5, color: palette.inkSoft }}>
              {[f.competition, f.venue, f.city].filter(Boolean).join(" · ")}
              {f.kickoff ? ` · ${formatKickoff(f.kickoff)}` : ""}
            </Text>
          </View>
        ))}
      </View>
    </SignalCard>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Primitives                                                              */
/* ─────────────────────────────────────────────────────────────────────── */

