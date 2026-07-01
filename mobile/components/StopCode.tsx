import { View, Text } from "react-native";
import { palette } from "@/constants/theme";

/**
 * "Stop 1234" numeral pill — mono type on a limestone ground, aegean rule.
 * Same visual grammar as the web StopCode component.
 */
export function StopCode({ code, size = "md" }: { code: string; size?: "sm" | "md" }) {
  const isSm = size === "sm";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        alignSelf: "flex-start",
        backgroundColor: palette.limestoneSoft,
        paddingLeft: 8,
        paddingRight: 10,
        paddingVertical: isSm ? 3 : 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "rgba(31,108,130,0.15)",
      }}
    >
      <View
        style={{
          width: 3,
          height: isSm ? 10 : 12,
          borderRadius: 2,
          backgroundColor: palette.aegeanDeep,
        }}
      />
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: isSm ? 10 : 11,
          letterSpacing: 1.4,
          color: palette.ink,
          textTransform: "uppercase",
          fontVariant: ["tabular-nums"],
        }}
      >
        Stop {code}
      </Text>
    </View>
  );
}
