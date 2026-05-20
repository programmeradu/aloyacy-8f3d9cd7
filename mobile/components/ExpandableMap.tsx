import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/theme";
import { MapView } from "./MapView";

// Import the shared prop type from whichever platform variant Metro resolved.
// Both `MapView.web.tsx` and `MapView.tsx` export the same `MapViewProps`
// contract (the native fallback re-exports it from `MapView.native`).
type MapViewProps = React.ComponentProps<typeof MapView>;


type Props = MapViewProps & {
  /** Radius (px) of the map container. Defaults to 18. */
  radius?: number;
  /** Optional caller-provided pressable overlay content (kickers/labels). */
  overlay?: React.ReactNode;
};

/**
 * Wraps `MapView` in a tap-to-expand shell. Tapping the map (or the pill in
 * the bottom-right corner) opens a full-screen sheet with the same map at
 * device-height — useful for scanning nearby stops and live vehicles at a
 * glance without losing scroll position on the underlying page.
 */
export function ExpandableMap({ radius = 18, overlay, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const dims = useWindowDimensions();
  const fullHeight = dims.height - insets.top;

  return (
    <View style={{ position: "relative", borderRadius: radius, overflow: "hidden" }}>
      <MapView {...props} />
      {overlay}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Expand map"
        onPress={() => setOpen(true)}
        style={styles.expandBtn}
      >
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7"
            stroke={palette.ink}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.expandLabel}>Expand</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: palette.limestone }}>
          <View style={{ paddingTop: insets.top }}>
            <View style={styles.sheetBar}>
              <Text style={styles.sheetTitle}>Live map</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.sheetClose}>Close</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <MapView {...props} height={fullHeight - 62} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  expandBtn: {
    position: "absolute",
    right: 14,
    bottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(246,241,231,0.96)",
    borderWidth: 1,
    borderColor: "rgba(31,30,24,0.10)",
  },
  expandLabel: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 1.6,
    color: palette.ink,
    textTransform: "uppercase",
  },
  sheetBar: {
    height: 62,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(31,30,24,0.08)",
  },
  sheetTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 20,
    color: palette.ink,
  },
  sheetClose: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    letterSpacing: 1.6,
    color: palette.aegeanDeep,
    textTransform: "uppercase",
  },
});
