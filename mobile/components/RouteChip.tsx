import { View, Text } from "react-native";
import { palette } from "@/constants/theme";

/**
 * Small route badge — uses the GTFS route_color as a left rail accent,
 * keeps the label in the brand ink so it stays legible on any colour.
 */
export function RouteChip({ short, color }: { short: string; color?: string }) {
  const bar = color ? `#${color}` : palette.aegean;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: palette.limestoneSoft,
        borderRadius: 10,
        overflow: "hidden",
        height: 32,
      }}
    >
      <View style={{ width: 4, height: "100%", backgroundColor: bar }} />
      <Text
        style={{
          fontFamily: "BricolageGrotesque_700Bold",
          fontSize: 15,
          color: palette.ink,
          paddingHorizontal: 10,
          letterSpacing: -0.2,
        }}
      >
        {short}
      </Text>
    </View>
  );
}
