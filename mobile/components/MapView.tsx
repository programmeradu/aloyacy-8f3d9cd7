import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import type { MapViewProps } from "./MapView.native";

const LIMESTONE = "#f3ede1";
const INK = "#2a261f";
const AEGEAN = "#3F9BB2";
const OCHRE = "#C9853A";
const OLIVE = "#3F4A36";

export function MapView({ height = 256 }: MapViewProps) {
  return (
    <View style={[styles.wrap, styles.web, { height }]}>
      <View style={styles.webWash} />
      <View style={styles.webRoadOne} />
      <View style={styles.webRoadTwo} />
      <View style={[styles.webPin, { left: "28%", top: "38%", backgroundColor: AEGEAN }]} />
      <View style={[styles.webPin, { left: "62%", top: "54%", backgroundColor: OCHRE }]} />
      <View style={[styles.webPin, { left: "47%", top: "68%", backgroundColor: OLIVE }]} />
      <AppText style={styles.webLabel}>Live Cyprus network</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: LIMESTONE,
  },
  web: {
    alignItems: "center",
    justifyContent: "center",
  },
  webWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(243,237,225,0.52)",
  },
  webRoadOne: {
    position: "absolute",
    left: "-8%",
    top: "50%",
    width: "116%",
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(31,108,130,0.55)",
    transform: [{ rotate: "-13deg" }],
  },
  webRoadTwo: {
    position: "absolute",
    left: "10%",
    top: "30%",
    width: "86%",
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(201,133,58,0.5)",
    transform: [{ rotate: "27deg" }],
  },
  webPin: {
    position: "absolute",
    width: 13,
    height: 13,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "rgba(246,241,231,0.92)",
  },
  webLabel: {
    position: "absolute",
    left: 14,
    bottom: 14,
    backgroundColor: "rgba(246,241,231,0.92)",
    color: INK,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: "hidden",
  },
});

export default MapView;
