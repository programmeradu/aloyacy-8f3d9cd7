// Kapnos intercity coach card — mirrors the web `CoachLineCard` chrome so the
// airport list reads as one continuous departures feed. Boarding stop, upcoming
// departures (with day chip + seats), timetable + book CTAs.

import { View, Text, Pressable, Linking, Image } from "react-native";
import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import type { AirportCoachLine } from "@/lib/airport";
import { seatPressure, seatLabel } from "@aloya/core/airport-board";

const TIMETABLE_URL = "https://kapnosairportshuttle.com/timetables";
const BOOK_URL = "https://kapnosairportshuttle.com/";

export function CoachLineCard({ line }: { line: AirportCoachLine }) {
  const next = line.nextDepartures[0];
  const sold = next ? seatPressure(next.seatsAvailable) === "sold" : false;

  return (
    <View
      style={{
        borderRadius: 24,
        backgroundColor: palette.white,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 18,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <View
              style={{
                width: 82,
                height: 28,
                borderRadius: 8,
                backgroundColor: palette.white,
                borderWidth: 1,
                borderColor: palette.line,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 6,
                overflow: "hidden",
              }}
            >
              <Image
                source={assets.kapnos_logo}
                accessibilityLabel="Kapnos logo"
                style={{ width: "100%", height: "100%" }}
                resizeMode="contain"
              />
            </View>
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 9.5,
                letterSpacing: 1.7,
                textTransform: "uppercase",
                color: palette.aegeanDeep,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              Direct coach
            </Text>
          </View>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "BricolageGrotesque_800ExtraBold",
              fontSize: 22,
              lineHeight: 25,
              letterSpacing: -0.5,
              color: palette.ink,
            }}
            numberOfLines={2}
          >
            → {line.destinationCity}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 11,
              letterSpacing: 1.4,
              color: palette.ink,
              fontVariant: ["tabular-nums"],
            }}
          >
            {line.rideMin} min
          </Text>
          {line.priceFrom ? (
            <Text
              style={{
                marginTop: 2,
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 1.2,
                color: palette.inkSoft,
                fontVariant: ["tabular-nums"],
              }}
            >
              from {line.priceFrom}
            </Text>
          ) : null}
        </View>
      </View>

      {line.nextDepartures.length > 0 && (
        <View
          style={{
            marginTop: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.line,
            overflow: "hidden",
          }}
        >
          {line.nextDepartures.slice(0, 3).map((d, i) => (
            <CoachDepartureRow
              key={`${d.tripId}-${d.depart}`}
              depart={d.depart}
              arrive={d.arrive}
              dayChip={d.dayChip}
              seatsAvailable={d.seatsAvailable}
              first={i === 0}
            />
          ))}
        </View>
      )}

      <Text
        style={{
          marginTop: 14,
          fontFamily: "Geist_500Medium",
          fontSize: 12,
          lineHeight: 17,
          color: palette.inkSoft,
        }}
        numberOfLines={2}
      >
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 9.5,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "rgba(31,30,24,0.45)",
          }}
        >
          Boards at:{" "}
        </Text>
        {line.pickupName}
      </Text>

      <View
        style={{
          marginTop: 14,
          flexDirection: "row",
          gap: 8,
          justifyContent: "flex-end",
        }}
      >
        <CoachAction label="Times" onPress={() => Linking.openURL(TIMETABLE_URL)} />
        <CoachAction
          label="Book"
          primary
          disabled={sold}
          onPress={() => Linking.openURL(BOOK_URL)}
        />
      </View>
    </View>
  );
}

function CoachDepartureRow({
  depart,
  arrive,
  dayChip,
  seatsAvailable,
  first,
}: {
  depart: string;
  arrive: string;
  dayChip?: string | null;
  seatsAvailable: number;
  first: boolean;
}) {
  const pressure = seatPressure(seatsAvailable);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.line,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
          flex: 1,
          minWidth: 0,
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 16,
            color: palette.ink,
            fontVariant: ["tabular-nums"],
          }}
        >
          {depart}
        </Text>
        <Text style={{ fontFamily: "Geist_700Bold", fontSize: 12, color: palette.inkSoft }}>
          →
        </Text>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 12,
            color: palette.ink,
            fontVariant: ["tabular-nums"],
          }}
        >
          {arrive}
        </Text>
        {dayChip ? (
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 9,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: palette.ochre,
            }}
          >
            {dayChip}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 9.5,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          textAlign: "right",
          color:
            pressure === "sold"
              ? "#a53d2b"
              : pressure === "low"
                ? palette.ochre
                : palette.inkSoft,
        }}
      >
        {seatLabel(seatsAvailable)}
      </Text>
    </View>
  );
}

function CoachAction({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const solid = primary && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: solid ? palette.ink : palette.white,
        borderWidth: 1,
        borderColor: solid ? palette.ink : palette.line,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "Geist_600SemiBold",
          fontSize: 12,
          color: solid
            ? palette.limestone
            : disabled
              ? "rgba(31,30,24,0.4)"
              : palette.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
