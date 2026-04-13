// Three ascending bars — same semantic as the web `ConfidenceIcon`,
// rendered with react-native-svg so it composes inside RN <View>.
// Press-and-hold reveals a tooltip; release dismisses. Touch-only.

import { useState } from "react";
import { View, Pressable, Text } from "react-native";
import Svg, { Rect } from "react-native-svg";
import type { FreshnessConfidence } from "@aloya/core/freshness";
import { palette } from "@/constants/theme";

const FILLED: Record<FreshnessConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const ACTIVE_COLOR: Record<FreshnessConfidence, string> = {
  high: palette.aegeanDeep,
  medium: palette.ochre,
  low: palette.inkSoft,
};

const LABEL: Record<FreshnessConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function ConfidenceIcon({
  confidence,
}: {
  confidence: FreshnessConfidence;
}) {
  const [open, setOpen] = useState(false);
  const filled = FILLED[confidence];
  const active = ACTIVE_COLOR[confidence];
  const dim = "rgba(31,30,24,0.18)";
  const w = 12;
  const h = 11;
  const bars = [3, 6.5, 10];

  return (
    <Pressable
      hitSlop={6}
      onPressIn={() => setOpen(true)}
      onPressOut={() => setOpen(false)}
      accessibilityLabel={LABEL[confidence]}
      accessibilityRole="image"
      style={{ position: "relative", justifyContent: "center" }}
    >
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {bars.map((bx, i) => {
          const barH = ((i + 1) / 3) * h;
          const isOn = i < filled;
          return (
            <Rect
              key={i}
              x={bx - 1}
              y={h - barH}
              width={2}
              height={barH}
              rx={0.6}
              fill={isOn ? active : dim}
            />
          );
        })}
      </Svg>

      {open ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: h + 6,
            left: -28,
            backgroundColor: palette.ink,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <Text
            style={{
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 9,
              letterSpacing: 1.4,
              color: palette.limestone,
              textTransform: "uppercase",
            }}
          >
            {LABEL[confidence]}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
