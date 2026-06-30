import Svg, { Path, Circle } from "react-native-svg";

type IconProps = { color: string; size?: number };

/**
 * Bespoke Aloya tab icons — no third-party set. Drawn at 24px on a 24
 * viewBox so they stay crisp at any density. Stroke-only for unfocused,
 * filled for focused via the `focused` flag in the layout.
 */
export function HomeIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 11 12 4l8.5 7v8.2a1.3 1.3 0 0 1-1.3 1.3H14.5v-5.6h-5V20.5H4.8a1.3 1.3 0 0 1-1.3-1.3V11Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.2} stroke={color} strokeWidth={1.8} />
      <Path
        d="m15.7 15.7 4 4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SavedIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-3.4L5.5 20V5.5a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function MoreIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={5.5} cy={12} r={1.6} fill={color} />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
      <Circle cx={18.5} cy={12} r={1.6} fill={color} />
    </Svg>
  );
}
