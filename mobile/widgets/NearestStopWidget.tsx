// Home Screen Widget Definition — "Nearest Stop" (Conceptual).
//
// In Expo, widgets are usually implemented via Config Plugins and native
// code (Swift for iOS Widgets, Java/Kotlin for Android Widgets). This file
// defines the layout and data-fetching logic that would be used by a
// bridge or template system like `expo-widgets` (once mature) or a custom
// native implementation.

import { View, Text, StyleSheet } from "react-native";
import { palette } from "@/constants/theme";

/**
 * Mock data representing what the widget would fetch from a
 * lightweight public endpoint like /api/public/stops/nearest.
 */
type WidgetData = {
  stopName: string;
  departures: {
    routeShort: string;
    etaMin: number;
  }[];
};

export function NearestStopWidget({ data }: { data: WidgetData }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{data.stopName}</Text>
      <View style={styles.list}>
        {data.departures.map((dep, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{dep.routeShort}</Text>
            </View>
            <Text style={styles.eta}>{dep.etaMin} min</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: palette.limestone,
    borderRadius: 22,
    flex: 1,
  },
  title: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 14,
    color: palette.ink,
    marginBottom: 10,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chip: {
    backgroundColor: palette.ink,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipText: {
    color: palette.white,
    fontSize: 11,
    fontFamily: "Geist_700Bold",
  },
  eta: {
    fontSize: 13,
    fontFamily: "Geist_600SemiBold",
    color: palette.aegeanDeep,
  },
});
