// Bespoke illustration for the Greek word of the day. Each motif is drawn by
// hand here — sunrise, laurel, bus, coffee, shoreline, olive sprig — so the
// card never falls back to a stock icon set.

import { greekMotif, type GreekMotif } from "@aloya/core/greek-word-motif";

export function GreekWordGlyph({ word, className }: { word: string; className?: string }) {
  const cat: GreekMotif = greekMotif(word);
  const common = {
    viewBox: "0 0 128 128",
    fill: "none" as const,
    xmlns: "http://www.w3.org/2000/svg",
    className,
    "aria-hidden": true as const,
  };
  const wash = (
    <>
      <defs>
        <radialGradient id={`gw-${cat}`} cx="70%" cy="30%" r="60%">
          <stop offset="0%" stopColor="var(--color-ochre)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--color-ochre)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="128" height="128" fill={`url(#gw-${cat})`} />
    </>
  );

  switch (cat) {
    case "greeting":
      // Sun rising over rolling hills.
      return (
        <svg {...common}>
          {wash}
          <circle cx="86" cy="46" r="18" fill="var(--color-ochre)" opacity="0.85" />
          <circle
            cx="86"
            cy="46"
            r="26"
            stroke="var(--color-ochre)"
            strokeWidth="1"
            fill="none"
            opacity="0.35"
          />
          <path
            d="M0 92 Q32 70 60 86 Q92 104 128 80 L128 128 L0 128 Z"
            fill="var(--color-olive)"
            opacity="0.2"
          />
          <path
            d="M0 104 Q40 88 76 100 Q104 110 128 96 L128 128 L0 128 Z"
            fill="var(--color-olive)"
            opacity="0.55"
          />
        </svg>
      );

    case "courtesy":
      // Laurel wreath — two opposing arcs of leaves.
      return (
        <svg {...common}>
          {wash}
          {[-1, 1].map((s) => (
            <g key={s} transform={`translate(64 70) scale(${s} 1)`}>
              <path
                d="M0 -32 Q24 -20 26 0 Q24 22 0 32"
                stroke="var(--color-olive)"
                strokeWidth="1.4"
                fill="none"
                opacity="0.6"
              />
              {[-24, -10, 4, 18].map((y, i) => (
                <ellipse
                  key={i}
                  cx="24"
                  cy={y}
                  rx="7"
                  ry="3.2"
                  fill="var(--color-olive)"
                  opacity={0.55 + (i % 2) * 0.2}
                  transform={`rotate(${-30 + i * 18} 24 ${y})`}
                />
              ))}
            </g>
          ))}
          <circle cx="64" cy="70" r="3" fill="var(--color-olive)" opacity="0.8" />
        </svg>
      );

    case "transit":
      // Stylised bus side-on.
      return (
        <svg {...common}>
          {wash}
          <rect
            x="20"
            y="50"
            width="80"
            height="38"
            rx="8"
            fill="var(--color-aegean-deep)"
            opacity="0.85"
          />
          <rect x="26" y="56" width="20" height="14" rx="2" fill="var(--color-card)" opacity="0.9" />
          <rect x="50" y="56" width="20" height="14" rx="2" fill="var(--color-card)" opacity="0.9" />
          <rect x="74" y="56" width="20" height="14" rx="2" fill="var(--color-card)" opacity="0.9" />
          <rect x="20" y="80" width="80" height="3" fill="var(--color-ink)" opacity="0.25" />
          <circle cx="36" cy="92" r="7" fill="var(--color-ink)" opacity="0.85" />
          <circle cx="36" cy="92" r="2.6" fill="var(--color-card)" />
          <circle cx="86" cy="92" r="7" fill="var(--color-ink)" opacity="0.85" />
          <circle cx="86" cy="92" r="2.6" fill="var(--color-card)" />
        </svg>
      );

    case "food":
      // Cyprus coffee cup with rising steam.
      return (
        <svg {...common}>
          {wash}
          <path
            d="M40 70 L88 70 L84 100 Q84 106 78 106 L50 106 Q44 106 44 100 Z"
            fill="var(--color-olive)"
            opacity="0.85"
          />
          <path
            d="M88 76 Q102 76 102 86 Q102 96 88 96"
            stroke="var(--color-olive)"
            strokeWidth="2.5"
            fill="none"
            opacity="0.7"
          />
          <ellipse cx="64" cy="70" rx="24" ry="4" fill="var(--color-ink)" opacity="0.25" />
          {[52, 64, 76].map((x, i) => (
            <path
              key={i}
              d={`M${x} 60 Q${x + 4} 50 ${x} 40 Q${x - 4} 30 ${x} 22`}
              stroke="var(--color-ink)"
              strokeWidth="1.5"
              fill="none"
              opacity={0.4 - i * 0.08}
              strokeLinecap="round"
            />
          ))}
        </svg>
      );

    case "place":
      // Beach: sun on water with three wave lines.
      return (
        <svg {...common}>
          {wash}
          <circle cx="90" cy="40" r="14" fill="var(--color-ochre)" opacity="0.85" />
          {[64, 78, 92, 106].map((y, i) => (
            <path
              key={y}
              d={`M0 ${y} Q16 ${y - 4} 32 ${y} T64 ${y} T96 ${y} T128 ${y}`}
              stroke="var(--color-aegean-deep)"
              strokeWidth="1.6"
              fill="none"
              opacity={0.7 - i * 0.12}
            />
          ))}
        </svg>
      );

    case "vibe":
    default:
      // Single olive sprig — curved stem with paired leaves and three olives.
      return (
        <svg {...common}>
          {wash}
          <g transform="translate(64 64) rotate(-22)">
            {/* Stem */}
            <path
              d="M-44 36 Q-10 8 38 -32"
              stroke="var(--color-olive)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              opacity="0.85"
            />
            {/* Paired leaves along the stem */}
            {[
              { t: 0.15, side: 1 },
              { t: 0.32, side: -1 },
              { t: 0.5, side: 1 },
              { t: 0.68, side: -1 },
              { t: 0.85, side: 1 },
            ].map(({ t, side }, i) => {
              // Quadratic bezier point + tangent
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
                <ellipse
                  key={i}
                  cx={lx}
                  cy={ly}
                  rx="11"
                  ry="3.6"
                  fill="var(--color-olive)"
                  opacity={0.5 + (i % 2) * 0.25}
                  transform={`rotate(${ang} ${lx} ${ly})`}
                />
              );
            })}
            {/* Olives */}
            <circle cx="-18" cy="14" r="3" fill="var(--color-ink)" opacity="0.65" />
            <circle cx="4" cy="-2" r="3" fill="var(--color-ink)" opacity="0.55" />
            <circle cx="22" cy="-18" r="3" fill="var(--color-ink)" opacity="0.7" />
          </g>
        </svg>
      );
  }
}
