// Roam live-bus marker: a clean top-down bus in brand yellow, front facing
// up (the map rotor turns it to the bus heading), with a white rim so it
// reads on aerial imagery. One geometry feeds both the imperative map
// overlay (SVG markup string) and the React <BusGlyph> component.
import type { CSSProperties } from "react";

type Shape =
  | { t: "rect"; x: number; y: number; w: number; h: number; rx: number; fill: string; stroke?: string; sw?: number; op?: number }
  | { t: "path"; d: string; fill: string; op?: number };

const Y = "#F6B83C";
const ROOF = "#FFD27A";
const UNIT = "#E3A12C";
const GLASS = "#22231F";

/** 64x64 viewBox, bus body 24x52 centred, front at the top. */
const SHAPES: Shape[] = [
  // mirrors
  { t: "rect", x: 16.5, y: 11, w: 4.5, h: 2.6, rx: 1.2, fill: GLASS },
  { t: "rect", x: 43, y: 11, w: 4.5, h: 2.6, rx: 1.2, fill: GLASS },
  // body with white rim
  { t: "rect", x: 20, y: 5, w: 24, h: 54, rx: 7.5, fill: Y, stroke: "#ffffff", sw: 2.2 },
  // windshield + glare
  { t: "path", d: "M23 13.6c0-3 2.2-5.4 5.2-5.4h7.6c3 0 5.2 2.4 5.2 5.4v2.2H23z", fill: GLASS },
  { t: "path", d: "M25.2 12.6c.6-1.6 1.8-2.4 3.4-2.4h3.2l-4.6 4.4h-2.2z", fill: "#ffffff", op: 0.35 },
  // roof panel
  { t: "rect", x: 23, y: 18.5, w: 18, h: 33, rx: 4, fill: ROOF },
  // roof units (air con, hatch)
  { t: "rect", x: 26.5, y: 22, w: 11, h: 7, rx: 2, fill: UNIT },
  { t: "rect", x: 26.5, y: 33, w: 11, h: 5, rx: 1.6, fill: UNIT, op: 0.8 },
  { t: "rect", x: 26.5, y: 42, w: 11, h: 5.5, rx: 2, fill: UNIT },
  // rear window
  { t: "rect", x: 25, y: 53.4, w: 14, h: 2.8, rx: 1.4, fill: GLASS, op: 0.85 },
];

function shapeMarkup(s: Shape): string {
  if (s.t === "rect") {
    const stroke = s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.sw ?? 1}"` : "";
    const op = s.op != null ? ` opacity="${s.op}"` : "";
    return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx}" fill="${s.fill}"${stroke}${op}/>`;
  }
  const op = s.op != null ? ` opacity="${s.op}"` : "";
  return `<path d="${s.d}" fill="${s.fill}"${op}/>`;
}

/** SVG markup for the imperative map overlay. */
export function busGlyphSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">${SHAPES.map(shapeMarkup).join("")}</svg>`;
}

/** Soft ground shadow for the glyph on aerial imagery. */
export const BUS_SHADOW = "drop-shadow(0 4px 5px rgba(0,0,0,0.38)) drop-shadow(0 1px 1px rgba(0,0,0,0.3))";

/** React version for non-map uses (legends, cards). */
export function BusGlyph({
  size = 40,
  headingDeg = 0,
  line,
  style,
}: {
  size?: number;
  headingDeg?: number;
  line?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ position: "relative", display: "inline-block", width: size, height: size, ...style }}
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        style={{ transform: `rotate(${headingDeg}deg)`, filter: BUS_SHADOW }}
      >
        {SHAPES.map((s, i) =>
          s.t === "rect" ? (
            <rect
              key={i}
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={s.rx}
              fill={s.fill}
              stroke={s.stroke}
              strokeWidth={s.sw}
              opacity={s.op}
            />
          ) : (
            <path key={i} d={s.d} fill={s.fill} opacity={s.op} />
          ),
        )}
      </svg>
      {line ? <span className="r-busbadge">{line}</span> : null}
    </span>
  );
}
