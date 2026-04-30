import { View, Text } from "react-native";
import { palette } from "@/constants/theme";

/**
 * Route badge — themed to the Aloya palette (aegean / ochre / olive) instead
 * of raw GTFS route_color, which ships arbitrary greens/reds/blues that
 * clash with our Mediterranean editorial system. `tone` may be supplied
 * directly; otherwise we derive it deterministically from the route short
 * so the same route always renders the same colour.
 */
type Tone = "aegean" | "ochre" | "olive";

const TONES: Record<Tone, { bg: string; fg: string; shadow: string }> = {
  aegean: { bg: palette.aegeanSoft, fg: palette.aegeanDeep, shadow: palette.aegeanDeep },
  ochre: { bg: palette.ochreSoft, fg: palette.ochre, shadow: palette.ochre },
  olive: { bg: "rgba(63,74,54,0.12)", fg: palette.olive, shadow: palette.olive },
};

function toneFor(short: string): Tone {
  let h = 0;
  for (let i = 0; i < short.length; i++) h = (h * 31 + short.charCodeAt(i)) | 0;
  const v = Math.abs(h) % 3;
  return v === 0 ? "aegean" : v === 1 ? "ochre" : "olive";
}

export function RouteChip({
  short,
  color: _color,
  tone,
  size = "md",
}: {
  short: string;
  /** Raw GTFS route_color — ignored on mobile to keep the theme cohesive. */
  color?: string;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}) {
  const t = TONES[tone ?? toneFor(short)];
  const dims =
    size === "lg"
      ? { h: 40, px: 14, fs: 20, radius: 12 }
      : size === "sm"
        ? { h: 26, px: 10, fs: 13, radius: 8 }
        : { h: 32, px: 12, fs: 16, radius: 10 };

  return (
    <View
      style={{
        height: dims.h,
        paddingHorizontal: dims.px,
        borderRadius: dims.radius,
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: `${t.fg}22`,
        alignItems: "center",
        justifyContent: "center",
        minWidth: dims.h + 6,
      }}
    >
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: dims.fs,
          color: t.fg,
          letterSpacing: -0.4,
          lineHeight: dims.fs + 2,
          fontVariant: ["tabular-nums"],
        }}
        numberOfLines={1}
      >
        {short}
      </Text>
    </View>
  );
}
