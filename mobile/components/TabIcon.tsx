// Bespoke Aloya tab icons — outline + filled pairs mirroring the web
// bottom nav (see src/components/Icons.tsx). Rendered at 24px on a 24
// viewBox so they stay crisp at any density. `focused` picks the
// filled variant; otherwise strokes render at 1.8.

import Svg, { Path, Circle, Ellipse, G, Rect } from "react-native-svg";

type IconProps = { color: string; size?: number; focused?: boolean };

const S = 24;

/* ─── Home / Today ────────────────────────────────────────────────────── */
export function HomeIcon({ color, size = S, focused }: IconProps) {
  if (focused) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M3.5 11 12 4l8.5 7v8.2a1.3 1.3 0 0 1-1.3 1.3H14.5v-5.6h-5V20.5H4.8a1.3 1.3 0 0 1-1.3-1.3V11Z"
          fill={color}
        />
      </Svg>
    );
  }
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

/* ─── Search ──────────────────────────────────────────────────────────── */
export function SearchIcon({ color, size = S, focused }: IconProps) {
  const sw = focused ? 2.3 : 1.8;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx={11}
        cy={11}
        r={6.2}
        stroke={color}
        strokeWidth={sw}
        fill={focused ? color : "none"}
        fillOpacity={focused ? 0.18 : 0}
      />
      <Path d="m15.7 15.7 4 4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}

/* ─── Saved (olive sprig) ─────────────────────────────────────────────── */
export function SavedIcon({ color, size = S, focused }: IconProps) {
  if (focused) {
    // Filled olive glyph — mirrors IconOliveFilled from web.
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <Ellipse cx={12} cy={15.5} rx={4.6} ry={1.9} />
        <Ellipse cx={12} cy={10.5} rx={3.6} ry={1.7} />
        <Ellipse cx={12} cy={6} rx={2.4} ry={1.4} />
      </Svg>
    );
  }
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

/* ─── More (kept for legacy stack routes) ─────────────────────────────── */
export function MoreIcon({ color, size = S }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={5.5} cy={12} r={1.6} fill={color} />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
      <Circle cx={18.5} cy={12} r={1.6} fill={color} />
    </Svg>
  );
}

/* ─── Plan (route waypoints) ──────────────────────────────────────────── */
export function PlanIcon({ color, size = S, focused }: IconProps) {
  const sw = focused ? 2.2 : 1.8;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 18c2.5 0 2.5-4 5-4s2.5 4 5 4 4.5-4 4.5-4"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={5} cy={7} r={1.8} stroke={color} strokeWidth={sw} fill={focused ? color : "none"} />
      <Circle cx={19} cy={11} r={1.8} stroke={color} strokeWidth={sw} fill={focused ? color : "none"} />
    </Svg>
  );
}

/* ─── Pulse (horizon + heartbeat) ─────────────────────────────────────── */
export function PulseIcon({ color, size = S, focused }: IconProps) {
  if (focused) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <G>
          <Path
            d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M2 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M2 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path
          d="M3 14h4l1.6-3.4L11.4 17l1.9-8 1.8 5.4L16.8 14H21"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={18.5} cy={6.5} r={1.6} fill={color} />
      </G>
    </Svg>
  );
}

/* ─── Wallet (ticket) ─────────────────────────────────────────────────── */
export function WalletIcon({ color, size = S, focused }: IconProps) {
  if (focused) {
    // Ticket silhouette with a dashed stub — mirrors IconTicketFilled.
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <Path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
        <Path
          d="M14 6.5v11"
          stroke="#F6F1E7"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeDasharray="1.5 2.5"
          fill="none"
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M4.5 10.5h15" stroke={color} strokeWidth={1.8} />
      <Circle cx={16.2} cy={14.4} r={1.15} fill={color} />
    </Svg>
  );
}
