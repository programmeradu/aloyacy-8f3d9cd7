// Bespoke SVG glyphs for the Pulse "Today" tiles and the Greek word of the
// day. Kept separate from the Today layout so neither file carries both the
// artwork and the composition.

import Svg, { Path, Circle, Rect, G, Line, Ellipse } from "react-native-svg";
import { palette } from "@/constants/theme";
import type { TodayTile } from "@/lib/pulse";

/** Bespoke SVG glyphs for tile kinds — mirrors src/components/TodayTileGlyph.tsx. */
export function TileGlyph({ kind, color }: { kind: TodayTile["kind"]; color: string }) {
  const s = 86;
  const card = palette.white;
  return (
    <Svg width={s} height={s} viewBox="0 0 96 96">
      {kind === "match" && (
        <>
          <Defs>
            <SvgRadialGradient id="g-match" cx="50%" cy="40%" r="55%">
              <SvgStop offset="0%" stopColor={color} stopOpacity="0.22" />
              <SvgStop offset="100%" stopColor={color} stopOpacity="0" />
            </SvgRadialGradient>
          </Defs>
          <Rect x={0} y={0} width={96} height={96} fill="url(#g-match)" />
          <Rect x={18} y={22} width={2} height={40} fill={color} opacity={0.45} />
          <Rect x={76} y={22} width={2} height={40} fill={color} opacity={0.45} />
          <Path d="M14 18 H24 V26 H14 Z" fill={color} opacity={0.85} />
          <Path d="M72 18 H82 V26 H72 Z" fill={color} opacity={0.85} />
          <Path d="M10 70 Q48 56 86 70 L86 78 Q48 64 10 78 Z" fill={color} opacity={0.18} />
          <Path d="M14 72 Q48 60 82 72 L82 76 Q48 64 14 76 Z" fill={color} opacity={0.55} />
          <Path d="M30 78 Q48 73 66 78" stroke={color} strokeWidth={1.2} opacity={0.65} fill="none" />
        </>
      )}
      {kind === "festival" && (
        <>
          <Path d="M8 22 Q48 42 88 22" stroke={color} strokeWidth={1.2} opacity={0.55} fill="none" />
          <Path d="M22 26 L30 26 L26 42 Z" fill={color} opacity={0.85} />
          <Path d="M40 32 L50 32 L45 50 Z" fill={color} opacity={0.55} />
          <Path d="M60 33 L70 33 L65 50 Z" fill={color} opacity={0.75} />
          <Circle cx={16} cy={56} r={1.8} fill={color} opacity={0.7} />
          <Circle cx={80} cy={60} r={2.2} fill={color} opacity={0.55} />
          <Circle cx={50} cy={68} r={1.6} fill={color} opacity={0.8} />
          <Circle cx={34} cy={74} r={2} fill={color} opacity={0.4} />
          <Circle cx={72} cy={78} r={1.4} fill={color} opacity={0.65} />
        </>
      )}
      {kind === "cruise" && (
        <>
          <Circle cx={74} cy={22} r={8} fill={color} opacity={0.25} />
          <Path d="M10 50 L74 50 L66 62 L18 62 Z" fill={color} opacity={0.85} />
          <Rect x={22} y={38} width={38} height={12} fill={color} opacity={0.45} />
          <Rect x={26} y={42} width={3} height={3} fill={card} />
          <Rect x={34} y={42} width={3} height={3} fill={card} />
          <Rect x={42} y={42} width={3} height={3} fill={card} />
          <Rect x={50} y={42} width={3} height={3} fill={card} />
          <Rect x={44} y={30} width={4} height={10} fill={color} opacity={0.7} />
          <Rect x={52} y={30} width={4} height={10} fill={color} opacity={0.7} />
          <Path d="M6 72 Q18 68 30 72 T54 72 T78 72 T96 72" stroke={color} strokeWidth={1.4} fill="none" opacity={0.55} />
          <Path d="M6 80 Q18 76 30 80 T54 80 T78 80 T96 80" stroke={color} strokeWidth={1.4} fill="none" opacity={0.35} />
        </>
      )}
      {kind === "holiday" && (
        <>
          <Circle cx={60} cy={32} r={14} fill={color} opacity={0.22} />
          <Circle cx={60} cy={32} r={9} fill={color} opacity={0.85} />
          <Path d="M30 86 Q26 60 22 36" stroke={color} strokeWidth={2.2} fill="none" opacity={0.85} strokeLinecap="round" />
          <Path d="M22 36 Q10 30 4 38" stroke={color} strokeWidth={1.6} fill="none" opacity={0.7} strokeLinecap="round" />
          <Path d="M22 36 Q26 22 38 20" stroke={color} strokeWidth={1.6} fill="none" opacity={0.7} strokeLinecap="round" />
          <Path d="M22 36 Q14 44 8 56" stroke={color} strokeWidth={1.6} fill="none" opacity={0.55} strokeLinecap="round" />
          <Path d="M22 36 Q34 36 44 44" stroke={color} strokeWidth={1.6} fill="none" opacity={0.55} strokeLinecap="round" />
        </>
      )}
      {kind === "nameday" && (
        <>
          {[-1, 1].map((sx) => (
            <G key={sx} transform={`translate(48 50) scale(${sx} 1)`}>
              <Path d="M0 -28 Q20 -18 22 0 Q20 18 0 28" stroke={color} strokeWidth={1.4} fill="none" opacity={0.55} />
              {[-22, -10, 2, 14].map((y, i) => (
                <Ellipse
                  key={i}
                  cx={20}
                  cy={y}
                  rx={6}
                  ry={3}
                  fill={color}
                  opacity={0.55 + (i % 2) * 0.2}
                  transform={`rotate(${-30 + i * 18} 20 ${y})`}
                />
              ))}
            </G>
          ))}
          <Circle cx={48} cy={50} r={3} fill={color} opacity={0.8} />
        </>
      )}
      {kind === "weather-sun" && (
        <>
          <Circle cx={48} cy={50} r={14} fill={color} opacity={0.85} />
          <Circle cx={48} cy={50} r={22} stroke={color} strokeWidth={1} fill="none" opacity={0.25} />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            const r1 = 26;
            const r2 = i % 2 === 0 ? 36 : 32;
            return (
              <Line
                key={i}
                x1={48 + Math.cos(a) * r1}
                y1={50 + Math.sin(a) * r1}
                x2={48 + Math.cos(a) * r2}
                y2={50 + Math.sin(a) * r2}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.7}
              />
            );
          })}
        </>
      )}
      {kind === "weather-rain" && (
        <>
          <Path
            d="M22 50 Q22 38 34 38 Q38 28 50 30 Q64 30 66 42 Q78 42 78 52 Q78 60 70 60 L30 60 Q22 60 22 50 Z"
            fill={color}
            opacity={0.65}
          />
          {[0, 1, 2].map((i) => (
            <Path
              key={i}
              d={`M${36 + i * 12} 70 L${30 + i * 12} 84`}
              stroke={color}
              strokeWidth={2.4}
              strokeLinecap="round"
              opacity={0.75 - i * 0.12}
              fill="none"
            />
          ))}
        </>
      )}
      {kind === "weather-cloud" && (
        <>
          <Path
            d="M16 58 Q16 44 30 44 Q34 32 48 34 Q64 34 66 48 Q82 48 82 60 Q82 70 72 70 L26 70 Q16 70 16 58 Z"
            fill={color}
            opacity={0.4}
          />
          <Path
            d="M22 60 Q22 50 32 50 Q36 42 46 44 Q58 44 60 54 Q72 54 72 62 Q72 70 64 70 L30 70 Q22 70 22 60 Z"
            fill={color}
            opacity={0.85}
          />
        </>
      )}
      {kind === "rhythm" && (
        <>
          <Circle cx={48} cy={50} r={26} stroke={color} strokeWidth={1.4} fill="none" opacity={0.5} />
          <Circle cx={48} cy={50} r={20} fill={color} opacity={0.1} />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            const r1 = 23;
            const r2 = i % 3 === 0 ? 19 : 21;
            return (
              <Line
                key={i}
                x1={48 + Math.cos(a) * r2}
                y1={50 + Math.sin(a) * r2}
                x2={48 + Math.cos(a) * r1}
                y2={50 + Math.sin(a) * r1}
                stroke={color}
                strokeWidth={i % 3 === 0 ? 1.8 : 1}
                opacity={0.7}
                strokeLinecap="round"
              />
            );
          })}
          <Line x1={48} y1={50} x2={48} y2={34} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
          <Line x1={48} y1={50} x2={60} y2={54} stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={0.85} />
          <Circle cx={48} cy={50} r={2.2} fill={color} />
        </>
      )}
    </Svg>
  );
}

/**
 * Bespoke Greek word glyph — mirrors the web GreekWordGlyph. Categorises
 * the word by meaning (greeting, courtesy, transit, food, place, vibe) and
 * renders a matching Cypriot motif with an ochre wash. Sits behind the
 * card content so numerals and letters stay the hero.
 */
type GreekCategory = "greeting" | "courtesy" | "transit" | "food" | "place" | "vibe";
const GREEK_CATEGORY: Record<string, GreekCategory> = {
  "Καλημέρα": "greeting", "Καλησπέρα": "greeting", "Γεια σου": "greeting",
  "Καλώς ήρθες": "greeting", "Καληνύχτα": "greeting",
  "Ευχαριστώ": "courtesy", "Παρακαλώ": "courtesy", "Συγγνώμη": "courtesy",
  "Ναι": "courtesy", "Όχι": "courtesy",
  "Στάση": "transit", "Λεωφορείο": "transit", "Εισιτήριο": "transit", "Ένα λεπτό": "transit",
  "Καφές": "food", "Χαλλούμι": "food", "Σούβλα": "food", "Νόστιμο": "food",
  "Φέρτε μου": "food", "Λογαριασμό": "food", "Στην υγειά σου": "food",
  "Παραλία": "place", "Νερό": "place", "Πού είναι;": "place",
};

export function GreekWordGlyph({ word }: { word: string }) {
  const cat: GreekCategory = GREEK_CATEGORY[word] ?? "vibe";
  const size = 128;
  const ochre = palette.ochre;
  const olive = palette.olive;
  const aegean = palette.aegeanDeep;
  const ink = palette.ink;
  const card = palette.white;

  const wash = (
    <Defs>
      <SvgRadialGradient id={`gw-${cat}`} cx="70%" cy="30%" r="60%">
        <SvgStop offset="0" stopColor={ochre} stopOpacity="0.4" />
        <SvgStop offset="100%" stopColor={ochre} stopOpacity="0" />
      </SvgRadialGradient>
    </Defs>
  );

  return (
    <Svg width={size} height={size} viewBox="0 0 128 128">
      {wash}
      <Rect x="0" y="0" width="128" height="128" fill={`url(#gw-${cat})`} />
      {cat === "greeting" && (
        <G>
          <Circle cx={86} cy={46} r={18} fill={ochre} opacity={0.85} />
          <Circle cx={86} cy={46} r={26} stroke={ochre} strokeWidth={1} fill="none" opacity={0.35} />
          <Path d="M0 92 Q32 70 60 86 Q92 104 128 80 L128 128 L0 128 Z" fill={olive} opacity={0.2} />
          <Path d="M0 104 Q40 88 76 100 Q104 110 128 96 L128 128 L0 128 Z" fill={olive} opacity={0.55} />
        </G>
      )}
      {cat === "courtesy" && (
        <G>
          {[-1, 1].map((s) => (
            <G key={s} transform={`translate(64 70) scale(${s} 1)`}>
              <Path d="M0 -32 Q24 -20 26 0 Q24 22 0 32" stroke={olive} strokeWidth={1.4} fill="none" opacity={0.6} />
              {[-24, -10, 4, 18].map((y, i) => (
                <Ellipse
                  key={i}
                  cx={24}
                  cy={y}
                  rx={7}
                  ry={3.2}
                  fill={olive}
                  opacity={0.55 + (i % 2) * 0.2}
                  transform={`rotate(${-30 + i * 18} 24 ${y})`}
                />
              ))}
            </G>
          ))}
          <Circle cx={64} cy={70} r={3} fill={olive} opacity={0.8} />
        </G>
      )}
      {cat === "transit" && (
        <G>
          <Rect x={20} y={50} width={80} height={38} rx={8} fill={aegean} opacity={0.85} />
          <Rect x={26} y={56} width={20} height={14} rx={2} fill={card} opacity={0.9} />
          <Rect x={50} y={56} width={20} height={14} rx={2} fill={card} opacity={0.9} />
          <Rect x={74} y={56} width={20} height={14} rx={2} fill={card} opacity={0.9} />
          <Rect x={20} y={80} width={80} height={3} fill={ink} opacity={0.25} />
          <Circle cx={36} cy={92} r={7} fill={ink} opacity={0.85} />
          <Circle cx={36} cy={92} r={2.6} fill={card} />
          <Circle cx={86} cy={92} r={7} fill={ink} opacity={0.85} />
          <Circle cx={86} cy={92} r={2.6} fill={card} />
        </G>
      )}
      {cat === "food" && (
        <G>
          <Path d="M40 70 L88 70 L84 100 Q84 106 78 106 L50 106 Q44 106 44 100 Z" fill={olive} opacity={0.85} />
          <Path d="M88 76 Q102 76 102 86 Q102 96 88 96" stroke={olive} strokeWidth={2.5} fill="none" opacity={0.7} />
          <Ellipse cx={64} cy={70} rx={24} ry={4} fill={ink} opacity={0.25} />
          {[52, 64, 76].map((x, i) => (
            <Path
              key={x}
              d={`M${x} 60 Q${x + 4} 50 ${x} 40 Q${x - 4} 30 ${x} 22`}
              stroke={ink}
              strokeWidth={1.5}
              fill="none"
              opacity={0.4 - i * 0.08}
              strokeLinecap="round"
            />
          ))}
        </G>
      )}
      {cat === "place" && (
        <G>
          <Circle cx={90} cy={40} r={14} fill={ochre} opacity={0.85} />
          {[64, 78, 92, 106].map((y, i) => (
            <Path
              key={y}
              d={`M0 ${y} Q16 ${y - 4} 32 ${y} T64 ${y} T96 ${y} T128 ${y}`}
              stroke={aegean}
              strokeWidth={1.6}
              fill="none"
              opacity={0.7 - i * 0.12}
            />
          ))}
        </G>
      )}
      {cat === "vibe" && (
        <G transform="translate(64 64) rotate(-22)">
          <Path d="M-44 36 Q-10 8 38 -32" stroke={olive} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.85} />
          {[
            { t: 0.15, side: 1 },
            { t: 0.32, side: -1 },
            { t: 0.5, side: 1 },
            { t: 0.68, side: -1 },
            { t: 0.85, side: 1 },
          ].map(({ t, side }, i) => {
            const p0 = { x: -44, y: 36 };
            const p1 = { x: -10, y: 8 };
            const p2 = { x: 38, y: -32 };
            const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
            const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
            const tx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
            const ty = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
            const ang = (Math.atan2(ty, tx) * 180) / Math.PI + side * 55;
            const lx = x + Math.cos((ang * Math.PI) / 180) * 10;
            const ly = y + Math.sin((ang * Math.PI) / 180) * 10;
            return (
              <Ellipse
                key={i}
                cx={lx}
                cy={ly}
                rx={11}
                ry={3.6}
                fill={olive}
                opacity={0.5 + (i % 2) * 0.25}
                transform={`rotate(${ang} ${lx} ${ly})`}
              />
            );
          })}
          <Circle cx={-18} cy={14} r={3} fill={ink} opacity={0.65} />
          <Circle cx={4} cy={-2} r={3} fill={ink} opacity={0.55} />
          <Circle cx={22} cy={-18} r={3} fill={ink} opacity={0.7} />
        </G>
      )}
    </Svg>
  );
}


