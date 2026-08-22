import Svg, { Circle, Path } from "react-native-svg";

/** Bespoke clock-within-a-ring mark used on the "watch this arrival" CTA. */
export function WatchGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.6} opacity={0.45} />
      <Circle cx="12" cy="12" r="4.5" stroke={color} strokeWidth={1.8} />
      <Path d="M12 7.5V12l3 1.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
