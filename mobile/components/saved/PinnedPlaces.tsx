// Pinned places list for the Saved tab.
//
// Extracted from `app/(tabs)/saved.tsx` so the screen file stays a composition
// of sections rather than one long render. The tone maps live here because
// this is the only surface that paints a saved place's monogram.

import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { removeSavedPlace, type SavedPlace } from "@/lib/trip-store";

export const TONE_CYCLE: SavedPlace["tone"][] = ["aegean", "ochre", "olive"];

const TONE_BG: Record<SavedPlace["tone"], string> = {
  aegean: palette.aegeanSoft,
  ochre: palette.ochreSoft,
  olive: "rgba(63,74,54,0.12)",
};
const TONE_FG: Record<SavedPlace["tone"], string> = {
  aegean: palette.aegeanDeep,
  ochre: palette.ochre,
  olive: palette.olive,
};

function EmptyPinned() {
  return (
    <View
      style={{
        backgroundColor: palette.white,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 20,
      }}
    >
      <Text
        style={{
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 18,
          color: palette.ink,
        }}
      >
        Nothing pinned yet
      </Text>
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          lineHeight: 19,
          color: palette.inkSoft,
          marginTop: 6,
        }}
      >
        Pin home, work, the beach. Live departures appear here, ready to glance
        at.
      </Text>
      <Pressable
        onPress={() => router.push("/plan")}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          marginTop: 14,
          backgroundColor: palette.ink,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: "Geist_600SemiBold",
            fontSize: 12,
            color: palette.limestone,
            letterSpacing: 0.3,
          }}
        >
          Plan a trip
        </Text>
      </Pressable>
    </View>
  );
}

function PinnedRow({ place }: { place: SavedPlace }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: palette.white,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 14,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 16,
          backgroundColor: TONE_BG[place.tone],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "BricolageGrotesque_800ExtraBold",
            fontSize: 18,
            color: TONE_FG[place.tone],
          }}
        >
          {(place.label[0] ?? place.name[0] ?? "A").toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 1.8,
            color: palette.inkSoft,
            textTransform: "uppercase",
          }}
          numberOfLines={1}
        >
          {place.label}
        </Text>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 17,
            lineHeight: 21,
            color: palette.ink,
            marginTop: 2,
          }}
          numberOfLines={2}
        >
          {place.name}
        </Text>
      </View>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          removeSavedPlace(place.id);
        }}
        style={({ pressed }) => ({
          backgroundColor: palette.limestoneSoft,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: palette.line,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{ fontFamily: "Geist_600SemiBold", fontSize: 12, color: palette.ink }}
        >
          Unpin
        </Text>
      </Pressable>
    </View>
  );
}

export function PinnedPlaces({ places }: { places: SavedPlace[] }) {
  if (places.length === 0) return <EmptyPinned />;
  return (
    <View style={{ gap: 10 }}>
      {places.map((p) => (
        <PinnedRow key={p.id} place={p} />
      ))}
    </View>
  );
}
