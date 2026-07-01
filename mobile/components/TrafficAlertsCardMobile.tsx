// Pre-trip traffic alerts — surfaced on /plan when CyNAP incidents
// intersect the planned itinerary. Editorial, calm, no icons.

import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import type { ItineraryTrafficReport } from "@/lib/traffic-alerts";

const KIND_LABEL: Record<string, string> = {
  roadworks: "ROADWORKS",
  closure: "CLOSURE",
  accident: "INCIDENT",
  congestion: "CONGESTION",
  weather: "WEATHER",
  other: "ADVISORY",
};

function distanceLabel(m: number): string {
  if (m < 100) return "on your route";
  if (m < 950) return `${m} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}

function freshness(observedAt: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(observedAt)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}

export function TrafficAlertsCardMobile({ report }: { report: ItineraryTrafficReport }) {
  const accentBg =
    report.highest === "high"
      ? palette.aegeanDeep
      : report.highest === "medium"
        ? palette.ochre
        : palette.oliveSoft;
  const accentFg = report.highest === "medium" ? palette.ink : palette.white;

  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 18,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              letterSpacing: 0.6,
              color: palette.aegeanDeep,
              textTransform: "uppercase",
            }}
          >
            Traffic on your route
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "BricolageGrotesque_700Bold",
              fontSize: 19,
              lineHeight: 23,
              color: palette.ink,
              letterSpacing: -0.3,
            }}
          >
            {report.alerts.length === 1
              ? "1 live incident to know about"
              : `${report.alerts.length} live incidents to know about`}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: accentBg,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 9.5,
              letterSpacing: 0.8,
              color: accentFg,
              textTransform: "uppercase",
            }}
          >
            {report.highest}
          </Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        {report.alerts.map((a, i) => (
          <View
            key={a.id}
            style={{
              backgroundColor: palette.limestoneSoft,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: "row",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                color: palette.inkSoft,
                letterSpacing: 0.4,
                paddingTop: 2,
                minWidth: 18,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 9.5,
                  letterSpacing: 0.6,
                  color: palette.inkSoft,
                  textTransform: "uppercase",
                }}
              >
                {KIND_LABEL[a.kind] ?? "ADVISORY"}
                {a.road ? ` — ${a.road}` : ""}
              </Text>
              <Text
                style={{
                  marginTop: 3,
                  fontFamily: "Geist_600SemiBold",
                  fontSize: 13.5,
                  lineHeight: 19,
                  color: palette.ink,
                }}
              >
                {a.headline}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                color: palette.inkSoft,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                paddingTop: 2,
              }}
            >
              {distanceLabel(a.distanceFromPathM)}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 9.5,
            letterSpacing: 0.5,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          Source · CyNAP live feed
        </Text>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 9.5,
            letterSpacing: 0.5,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
        >
          Updated {freshness(report.observedAt)}
        </Text>
      </View>
    </View>
  );
}
