import { View, Text } from "react-native";
import { palette } from "@/constants/theme";

/**
 * Fleet-number pill for the bus riders see on the map + trip HUD. Ink
 * ground, limestone numeral, tabular-nums so 4-digit fleets don't jitter.
 */
export function BusNumberBadge({ number }: { number: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: palette.ink,
        paddingLeft: 8,
        paddingRight: 12,
        paddingVertical: 6,
        borderRadius: 10,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 9,
          letterSpacing: 1.6,
          color: palette.ochreSoft,
          textTransform: "uppercase",
        }}
      >
        Bus
      </Text>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 15,
          color: palette.limestone,
          letterSpacing: -0.2,
          fontVariant: ["tabular-nums"],
          lineHeight: 17,
        }}
      >
        {number}
      </Text>
    </View>
  );
}
