import { View, Text } from "react-native";
import { palette } from "@/constants/theme";

/**
 * Route badge — GTFS route_color painted as a full ground with a soft
 * limestone spine so the numeral stays legible on any brand colour. Type
 * uses Bricolage extrabold, tight tracking, single-line, generous baseline.
 * Auto-derives ink vs limestone foreground from the route color luminance.
 */
export function RouteChip({
  short,
  color,
  size = "md",
}: {
  short: string;
  color?: string;
  size?: "sm" | "md" | "lg";
}) {
  const hex = color ? (color.startsWith("#") ? color : `#${color}`) : palette.aegean;
  const fg = readableForeground(hex);
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
        backgroundColor: hex,
        alignItems: "center",
        justifyContent: "center",
        minWidth: dims.h + 6,
        shadowColor: hex,
        shadowOpacity: 0.25,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: dims.fs,
          color: fg,
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

function readableForeground(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return palette.white;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // Relative luminance (per WCAG). Under 0.55 = dark ground → limestone.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.55 ? palette.limestone : palette.ink;
}
