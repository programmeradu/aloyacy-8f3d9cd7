// Three-up network vitals under the map: live bus count, on-time share, and
// the soonest ride from the closest stop. Values are pre-formatted by the
// caller; an em-dash stands in for "not known yet" so the row never jumps.

import { View, Text, Image, StyleSheet } from "react-native";
import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";

type Tone = "aegean" | "ochre" | "olive";

export function QuickStats({
  liveBuses,
  onTimePct,
  nextRideMin,
}: {
  liveBuses: number;
  onTimePct: number | null;
  nextRideMin: number | null;
}) {
  return (
    <View style={styles.grid}>
      <QuickStat
        label="Live buses"
        value={liveBuses > 0 ? String(liveBuses) : "—"}
        tone="aegean"
        image={assets.stat_bus}
      />
      <QuickStat
        label="On time"
        value={onTimePct !== null ? `${onTimePct}%` : "—"}
        tone="olive"
        image={assets.stat_dial}
      />
      <QuickStat
        label="Next ride"
        value={nextRideMin != null ? `${nextRideMin}′` : "—"}
        tone="ochre"
        image={assets.stat_road}
      />
    </View>
  );
}

function QuickStat({
  label,
  value,
  tone,
  image,
}: {
  label: string;
  value: string;
  tone: Tone;
  image: { uri: string };
}) {
  const color = tone === "aegean" ? palette.aegeanDeep : tone === "ochre" ? palette.ochre : palette.olive;
  return (
    <View style={styles.card}>
      <Image source={image} style={styles.image} resizeMode="contain" />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { marginTop: 12, paddingHorizontal: 20, flexDirection: "row", gap: 8 },
  card: {
    flex: 1,
    minHeight: 92,
    borderRadius: 18,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
    padding: 12,
  },
  image: { position: "absolute", right: -3, bottom: -4, width: "58%", height: "58%", opacity: 0.62 },
  label: {
    fontFamily: "Geist_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
    color: palette.inkSoft,
    textTransform: "uppercase",
  },
  value: {
    marginTop: 9,
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 27,
    lineHeight: 30,
  },
});
