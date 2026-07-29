// Horizontal rail of the nearest neighbourhoods, tapping straight through to
// the stop. Long area names wrap to a single truncated line inside a chip that
// grows to its content up to a sane max, so nothing clips mid-word.

import { ScrollView, Pressable, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { palette } from "@/constants/theme";
import { areaFromStop } from "@aloya/core/home-board";

export type ChipStop = { id: string; name: string };

export function AreaChips({ stops }: { stops: ChipStop[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {stops.length === 0 ? (
        <Text style={styles.locating}>Locating nearby stops</Text>
      ) : (
        stops.map((s, i) => (
          <Pressable
            key={s.id}
            onPress={() => router.push(`/stop/${s.id}`)}
            style={[styles.chip, i % 3 === 1 && styles.chipOlive, i % 3 === 2 && styles.chipOchre]}
          >
            <Text
              style={[
                styles.chipText,
                i % 3 === 1 && styles.chipTextOlive,
                i % 3 === 2 && styles.chipTextOchre,
              ]}
              numberOfLines={1}
            >
              {areaFromStop(s)}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, paddingTop: 14, gap: 8 },
  locating: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 1.8,
    color: palette.inkSoft,
    textTransform: "uppercase",
    paddingVertical: 8,
  },
  chip: {
    maxWidth: 200,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: "rgba(63,155,178,0.14)",
  },
  chipOlive: { backgroundColor: "rgba(63,74,54,0.11)" },
  chipOchre: { backgroundColor: "rgba(201,133,58,0.16)" },
  chipText: { fontFamily: "Geist_600SemiBold", fontSize: 13, color: palette.aegeanDeep },
  chipTextOlive: { color: palette.olive },
  chipTextOchre: { color: palette.ochre },
});
