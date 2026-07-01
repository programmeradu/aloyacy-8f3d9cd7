import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";
import { Card } from "./Card";
import { palette } from "@/constants/theme";
import type { Itinerary, Leg, RationaleTag } from "@/lib/plan";

function fmtClock(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDur(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function rationaleCopy(t: RationaleTag): string {
  switch (t.kind) {
    case "fastest": return `Arrives ${t.minutesEarlier} min earlier`;
    case "no-changes": return "No changes";
    case "fewer-changes": return `${t.n} fewer change${t.n > 1 ? "s" : ""}`;
    case "less-walking": return `${t.metersSaved} m less walking`;
    case "all-live": return "All buses live";
    case "more-reliable": return "More reliable today";
    case "leaves-sooner": return `Leaves ${t.minutesSooner} min sooner`;
    case "best-overall": return "Best overall";
  }
}

function LegRow({ leg }: { leg: Leg }) {
  if (leg.kind === "ride") {
    return (
      <View style={{ flexDirection: "row", gap: 14, paddingVertical: 12 }}>
        <View
          style={{
            minWidth: 56,
            height: 28,
            paddingHorizontal: 10,
            borderRadius: 8,
            backgroundColor: palette.aegean,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: "Geist_700Bold", color: palette.white, fontSize: 13 }}>
            {leg.routeShort}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Geist_600SemiBold", color: palette.ink, fontSize: 14 }} numberOfLines={1}>
            {leg.board.name} → {leg.alight.name}
          </Text>
          <Text style={{ fontFamily: "Geist_700Bold", color: palette.inkSoft, fontSize: 11, marginTop: 2 }}>
            {fmtClock(leg.board.departureUnix)} – {fmtClock(leg.alight.arrivalUnix)} · {leg.stopCount} stops
            {leg.live ? " · live" : ""}
          </Text>
        </View>
      </View>
    );
  }
  if (leg.kind === "walk") {
    return (
      <View style={{ flexDirection: "row", gap: 14, paddingVertical: 12 }}>
        <View
          style={{
            minWidth: 56,
            height: 28,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: palette.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: "Geist_700Bold", color: palette.olive, fontSize: 11 }}>
            WALK
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Geist_600SemiBold", color: palette.ink, fontSize: 14 }} numberOfLines={1}>
            {leg.from.name} → {leg.to.name}
          </Text>
          <Text style={{ fontFamily: "Geist_700Bold", color: palette.inkSoft, fontSize: 11, marginTop: 2 }}>
            {fmtDur(leg.durationSec)} · {Math.round(leg.distanceMeters)} m
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", gap: 14, paddingVertical: 8 }}>
      <View style={{ minWidth: 56 }} />
      <Text style={{ fontFamily: "Geist_500Medium", color: palette.inkSoft, fontSize: 12 }}>
        Wait {fmtDur(leg.durationSec)} at {leg.name}
      </Text>
    </View>
  );
}

export function ItineraryCard({
  itinerary,
  onStart,
}: {
  itinerary: Itinerary;
  onStart?: (it: Itinerary) => void;
}) {
  const rides = itinerary.legs.filter((l): l is Extract<Leg, { kind: "ride" }> => l.kind === "ride");
  const startable = !!onStart;
  const content = (
    <>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: "BricolageGrotesque_700Bold", color: palette.ink, fontSize: 22, letterSpacing: -0.4 }}>
          {fmtClock(itinerary.departureUnix)} → {fmtClock(itinerary.arrivalUnix)}
        </Text>
        <Text style={{ fontFamily: "Geist_700Bold", color: palette.aegeanDeep, fontSize: 14 }}>
          {fmtDur(itinerary.totalDurationSec)}
        </Text>
      </View>
      <Text style={{ fontFamily: "Geist_700Bold", color: palette.inkSoft, fontSize: 11, marginTop: 4 }}>
        {rides.length} ride{rides.length === 1 ? "" : "s"} · {itinerary.transfers} change{itinerary.transfers === 1 ? "" : "s"} ·
        {" "}{Math.round(itinerary.totalWalkMeters)} m walk · {itinerary.source}
      </Text>

      {itinerary.rationale && itinerary.rationale.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {itinerary.rationale.map((t, i) => (
            <View
              key={i}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: palette.ochreSoft,
              }}
            >
              <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 11, color: palette.ink }}>
                {rationaleCopy(t)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 1, backgroundColor: palette.line, marginTop: 14 }} />
      <View>
        {itinerary.legs.map((leg, i) => (
          <LegRow key={i} leg={leg} />
        ))}
      </View>

      {startable && (
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: palette.ink,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 1.6,
                color: palette.limestone,
                opacity: 0.7,
              }}
            >
              START THIS TRIP
            </Text>
            <Text
              style={{
                fontFamily: "Geist_600SemiBold",
                fontSize: 13,
                color: palette.limestone,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              Turn-by-turn walk · live bus tracking
            </Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="m9 6 6 6-6 6" stroke={palette.limestone} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      )}
    </>
  );

  if (!startable) {
    return <Card style={{ padding: 18 }}>{content}</Card>;
  }

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onStart!(itinerary);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
      accessibilityRole="button"
      accessibilityLabel={`Start trip departing ${fmtClock(itinerary.departureUnix)}, arriving ${fmtClock(itinerary.arrivalUnix)}`}
    >
      <Card style={{ padding: 18 }}>{content}</Card>
    </Pressable>
  );
}
