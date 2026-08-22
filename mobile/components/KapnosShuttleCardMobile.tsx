// Mobile Kapnos Airport Shuttle card — compact summary of the next few
// coaches with a "book online" handoff. Pickup/dropoff distance shown so
// riders can decide if the walk is reasonable. When the coach stop isn't
// a reasonable walk from the origin (or destination isn't a reasonable
// walk from the dropoff), we surface a first-/last-mile bus plan that
// the rider can tap to start immediately — same as the web experience.
import { useState } from "react";
import { View, Text, Pressable, Linking, Image } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import type { KapnosSuggestion } from "@/lib/kapnos";
import { startKapnosCompanion } from "@/lib/kapnos-companion";
import { WALKABLE_M, fmtMin, fmtTime, prettyRoute, shortStop } from "@/lib/kapnos-format";
import { Endpoint } from "./kapnos/Endpoint";
import { MileSection } from "./kapnos/MileSection";

import type { Itinerary } from "@/lib/journey-types";

export function KapnosShuttleCardMobile({
  suggestion,
  firstMile,
  lastMile,
  firstMileLoading,
  lastMileLoading,
  onPlanFirstMile,
  onPlanLastMile,
}: {
  suggestion: KapnosSuggestion;
  firstMile?: Itinerary | null;
  lastMile?: Itinerary | null;
  firstMileLoading?: boolean;
  lastMileLoading?: boolean;
  onPlanFirstMile?: () => void;
  onPlanLastMile?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? suggestion.departures : suggestion.departures.slice(0, 3);

  const pickupFar = suggestion.pickup.distanceM > WALKABLE_M;
  const dropoffFar = suggestion.dropoff.distanceM > WALKABLE_M;

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
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Image
            source={assets.kapnos_logo}
            accessibilityLabel="Kapnos logo"
            style={{ width: 78, height: 22 }}
            resizeMode="contain"
          />
          <View style={{ width: 1, height: 14, backgroundColor: palette.line }} />
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 10,
              color: palette.aegeanDeep,
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          >
            Airport coach
          </Text>
        </View>
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

      {pickupFar && (
        <MileSection
          title={`BUS TO ${shortStop(suggestion.pickup.name).toUpperCase()}`}
          itinerary={firstMile ?? null}
          loading={!!firstMileLoading}
          onStart={onPlanFirstMile}
          emptyCopy="No direct bus reaches the coach stop in time. Consider a taxi or car for the first mile."
        />
      )}

      {dropoffFar && (
        <MileSection
          title={`BUS FROM ${shortStop(suggestion.dropoff.name).toUpperCase()}`}
          itinerary={lastMile ?? null}
          loading={!!lastMileLoading}
          onStart={onPlanLastMile}
          emptyCopy="No bus continues from the coach dropoff to your destination. Plan a taxi from the stop."
        />
      )}

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
            <Pressable
              key={d.tripId}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                startKapnosCompanion(suggestion, d);
                router.push(`/trip/kapnos-${d.tripId}`);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: palette.limestoneSoft,
                borderRadius: 12,
                gap: 10,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
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
                    marginTop: 2,
                    fontFamily: "Geist_700Bold",
                    fontSize: 9,
                    color: palette.aegeanDeep,
                    letterSpacing: 1.2,
                  }}
                >
                  TAP TO START COMPANION
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Geist_600SemiBold",
                  fontSize: 12,
                  color: palette.inkSoft,
                }}
              >
                {d.priceLabel || `${d.durationMin} min`}
              </Text>
            </Pressable>
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
