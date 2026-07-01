// Mobile Kapnos Airport Shuttle card — compact summary of the next few
// coaches with a "book online" handoff. Pickup/dropoff distance shown so
// riders can decide if the walk is reasonable.
import { useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import type { KapnosSuggestion } from "@/lib/kapnos";

function fmtWalk(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
function fmtTime(local: string): string {
  return (local.split(" ")[1] ?? "").slice(0, 5);
}
function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}
function prettyRoute(name: string): string {
  return name
    .split(/\s*>\s*/)
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" → ");
}

export function KapnosShuttleCardMobile({
  suggestion,
}: {
  suggestion: KapnosSuggestion;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? suggestion.departures : suggestion.departures.slice(0, 3);

  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 18,
        gap: 14,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            color: palette.aegeanDeep,
            letterSpacing: 0.6,
          }}
        >
          KAPNOS COACH
        </Text>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            color: palette.inkSoft,
            letterSpacing: 0.4,
          }}
        >
          ~{fmtMin(suggestion.rideSec)} MIN RIDE
        </Text>
      </View>

      <Text
        style={{
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 20,
          lineHeight: 24,
          color: palette.ink,
          letterSpacing: -0.4,
        }}
      >
        {prettyRoute(suggestion.routeName)}
      </Text>

      <View style={{ gap: 6 }}>
        <Endpoint
          label={suggestion.airportIsOrigin ? "From airport" : "From"}
          name={suggestion.pickup.name}
          distance={suggestion.pickup.distanceM}
        />
        <Endpoint
          label={suggestion.airportIsOrigin ? "To" : "To airport"}
          name={suggestion.dropoff.name}
          distance={suggestion.dropoff.distanceM}
        />
      </View>

      {suggestion.departures.length === 0 ? (
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13,
            color: palette.inkSoft,
            lineHeight: 19,
          }}
        >
          No upcoming coaches in your time window.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {shown.map((d) => (
            <View
              key={d.tripId}
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: palette.limestoneSoft,
                borderRadius: 12,
                gap: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 14,
                  color: palette.ink,
                  letterSpacing: 0.5,
                }}
              >
                {fmtTime(d.departLocal)} → {fmtTime(d.arriveLocal)}
              </Text>
              <Text
                style={{
                  fontFamily: "Geist_600SemiBold",
                  fontSize: 12,
                  color: palette.inkSoft,
                }}
              >
                {d.priceLabel || `${d.durationMin} min`}
              </Text>
            </View>
          ))}
          {suggestion.departures.length > 3 && (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setExpanded((v) => !v);
              }}
              hitSlop={6}
            >
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 11,
                  color: palette.aegeanDeep,
                  letterSpacing: 0.4,
                  paddingTop: 4,
                }}
              >
                {expanded
                  ? "SHOW LESS"
                  : `SHOW ALL ${suggestion.departures.length}`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          Linking.openURL(suggestion.bookingUrl).catch(() => {});
        }}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          backgroundColor: palette.ink,
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 10,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            color: palette.white,
            fontSize: 13,
            letterSpacing: 0.3,
          }}
        >
          Book on Kapnos
        </Text>
      </Pressable>
    </View>
  );
}

function Endpoint({
  label,
  name,
  distance,
}: {
  label: string;
  name: string;
  distance: number;
}) {
  return (
    <View>
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          color: palette.inkSoft,
          letterSpacing: 0.4,
        }}
      >
        {label.toUpperCase()} · {fmtWalk(distance)} WALK
      </Text>
      <Text
        style={{
          fontFamily: "Geist_600SemiBold",
          fontSize: 14,
          color: palette.ink,
          marginTop: 1,
        }}
        numberOfLines={1}
      >
        {name.replace(/^\([A-Z0-9]+\)\s*/i, "").trim()}
      </Text>
    </View>
  );
}
