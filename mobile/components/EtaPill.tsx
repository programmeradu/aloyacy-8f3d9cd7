import { View, Text } from "react-native";
import { palette } from "@/constants/theme";
import type { EtaTier } from "@/lib/format";

const TIER_COLOR: Record<EtaTier, { bg: string; fg: string; dot: string }> = {
  now: { bg: palette.aegeanDeep, fg: palette.white, dot: palette.white },
  soon: { bg: palette.aegeanSoft, fg: palette.aegeanDeep, dot: palette.aegean },
  scheduled: { bg: palette.limestoneSoft, fg: palette.ink, dot: palette.inkSoft },
  past: { bg: palette.limestoneSoft, fg: palette.inkSoft, dot: palette.inkSoft },
};

export function EtaPill({
  label,
  tier,
  stale,
}: {
  label: string;
  tier: EtaTier;
  stale?: boolean;
}) {
  const c = TIER_COLOR[tier];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: c.bg,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        opacity: stale ? 0.55 : 1,
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: c.dot,
        }}
      />
      <Text
        style={{
          color: c.fg,
          fontFamily: "Geist_700Bold",
          fontSize: 13,
          letterSpacing: 0.3,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}
