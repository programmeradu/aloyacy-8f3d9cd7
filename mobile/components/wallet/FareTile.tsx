// Fare reference tile. Photo-backed with a color wash so the type is
// always legible — matches the web fare grid used on /wallet.

import { Image, Text, View, StyleSheet, ImageSourcePropType } from "react-native";
import { palette } from "@/constants/theme";

export function FareTile({
  label,
  value,
  sub,
  image,
  tone = "light",
}: {
  label: string;
  value: string;
  sub: string;
  image?: ImageSourcePropType;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <View style={styles.card}>
      {image && <Image source={image} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: dark ? "rgba(15,26,32,0.72)" : "rgba(246,241,231,0.78)",
          },
        ]}
      />
      <View style={styles.content}>
        <Text style={[styles.label, { color: dark ? "rgba(246,241,231,0.85)" : palette.inkSoft }]}>
          {label.toUpperCase()}
        </Text>
        <View style={styles.row}>
          <Text style={[styles.value, { color: dark ? palette.limestone : palette.ink }]}>
            {value}
          </Text>
          <Text style={[styles.sub, { color: dark ? "rgba(246,241,231,0.78)" : palette.inkSoft }]}>
            {sub}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 96,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.line,
    flex: 1,
    minWidth: 0,
  },
  content: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "space-between",
  },
  label: {
    fontFamily: "Geist_700Bold",
    fontSize: 9,
    letterSpacing: 1.8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 6,
  },
  value: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 20,
    letterSpacing: -0.2,
  },
  sub: {
    fontFamily: "Geist_500Medium",
    fontSize: 10,
  },
});
