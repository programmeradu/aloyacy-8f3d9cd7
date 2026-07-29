// Map band on the Today screen: nearby stops plus live vehicles, with an
// editorial stamp naming the area the rider is looking at. Falls back to a
// Nicosia preview label when we have no GPS fix yet.

import { View, Text, StyleSheet } from "react-native";
import { palette } from "@/constants/theme";
import { ExpandableMap } from "@/components/ExpandableMap";

export type MapMarker = {
  lat: number;
  lng: number;
  label: string;
  tone: "aegean";
  kind: "stop";
};

export function HomeMapBand({
  center,
  markers,
  userLocation,
  area,
  usingFallback,
}: {
  center: { lat: number; lng: number };
  markers: MapMarker[];
  userLocation: { lat: number; lng: number } | null;
  area: string;
  usingFallback: boolean;
}) {
  return (
    <View style={styles.band}>
      <ExpandableMap
        height={238}
        center={center}
        markers={markers}
        userLocation={userLocation}
        liveVehicles
        spanKm={2.2}
        fitToContent={false}
        overlay={
          <View pointerEvents="none" style={styles.overlay}>
            <Text style={styles.kicker}>{usingFallback ? "Nicosia preview" : "Around you"}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {area}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  band: { marginTop: 20, paddingHorizontal: 20, position: "relative" },
  overlay: {
    position: "absolute",
    left: 34,
    top: 14,
    maxWidth: 230,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(246,241,231,0.94)",
    borderWidth: 1,
    borderColor: "rgba(31,30,24,0.08)",
  },
  kicker: {
    fontFamily: "Geist_700Bold",
    fontSize: 9,
    letterSpacing: 1.8,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 2,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 19,
    lineHeight: 22,
    color: palette.ink,
  },
});
