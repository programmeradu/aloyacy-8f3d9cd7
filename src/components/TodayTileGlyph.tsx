// Bespoke editorial glyphs for "On the island right now" tiles.
// Hand-drawn flat SVG illustrations — not iconography. Context-aware,
// tinted in the tile's accent color, anchored top-right of the card.

import type { TodayTileKind } from "@/lib/today.functions";

type Accent = "ochre" | "aegean" | "olive" | "ink";

const ACCENT_VAR: Record<Accent, string> = {
  ochre: "var(--color-ochre)",
  aegean: "var(--color-aegean-deep)",
  olive: "var(--color-olive)",
  ink: "var(--color-ink)",
};

export function TodayTileGlyph({
  kind,
  accent,
  className,
}: {
  kind: TodayTileKind;
  accent: Accent;
  className?: string;
}) {
  const color = ACCENT_VAR[accent];

  // Common SVG attributes — 96×96, no padding, rendered crisp.
  const common = {
    viewBox: "0 0 96 96",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className,
    "aria-hidden": true as const,
  };

  switch (kind) {
    case "match":
      // Stadium silhouette with two floodlights and a soft halo.
      return (
        <svg {...common}>
          <defs>
            <radialGradient id="g-match" cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="96" height="96" fill="url(#g-match)" />
          {/* Floodlights */}
          <rect x="18" y="22" width="2" height="40" fill={color} opacity="0.45" />
          <rect x="76" y="22" width="2" height="40" fill={color} opacity="0.45" />
          <path d="M14 18 H24 V26 H14 Z" fill={color} opacity="0.85" />
          <path d="M72 18 H82 V26 H72 Z" fill={color} opacity="0.85" />
          {/* Stadium bowl */}
          <path
            d="M10 70 Q48 56 86 70 L86 78 Q48 64 10 78 Z"
            fill={color}
            opacity="0.18"
          />
          <path
            d="M14 72 Q48 60 82 72 L82 76 Q48 64 14 76 Z"
            fill={color}
            opacity="0.55"
          />
          {/* Pitch line */}
          <path d="M30 78 Q48 73 66 78" stroke={color} strokeWidth="1.2" opacity="0.65" />
        </svg>
      );

    case "festival":
      // Bunting garland — three pennants on a string.
      return (
        <svg {...common}>
          <path
            d="M8 22 Q48 42 88 22"
            stroke={color}
            strokeWidth="1.2"
            opacity="0.55"
            fill="none"
          />
          <path d="M22 26 L30 26 L26 42 Z" fill={color} opacity="0.85" />
          <path d="M40 32 L50 32 L45 50 Z" fill={color} opacity="0.55" />
          <path d="M60 33 L70 33 L65 50 Z" fill={color} opacity="0.75" />
          {/* Confetti dots */}
          <circle cx="16" cy="56" r="1.8" fill={color} opacity="0.7" />
          <circle cx="80" cy="60" r="2.2" fill={color} opacity="0.55" />
          <circle cx="50" cy="68" r="1.6" fill={color} opacity="0.8" />
          <circle cx="34" cy="74" r="2" fill={color} opacity="0.4" />
          <circle cx="72" cy="78" r="1.4" fill={color} opacity="0.65" />
        </svg>
      );

    case "cruise":
      // Cruise ship prow over two wave lines.
      return (
        <svg {...common}>
          {/* Sun disk */}
          <circle cx="74" cy="22" r="8" fill={color} opacity="0.25" />
          {/* Ship hull + superstructure */}
          <path
            d="M10 50 L74 50 L66 62 L18 62 Z"
            fill={color}
            opacity="0.85"
          />
          <rect x="22" y="38" width="38" height="12" fill={color} opacity="0.45" />
          <rect x="26" y="42" width="3" height="3" fill="var(--color-card)" />
          <rect x="34" y="42" width="3" height="3" fill="var(--color-card)" />
          <rect x="42" y="42" width="3" height="3" fill="var(--color-card)" />
          <rect x="50" y="42" width="3" height="3" fill="var(--color-card)" />
          {/* Funnels */}
          <rect x="44" y="30" width="4" height="10" fill={color} opacity="0.7" />
          <rect x="52" y="30" width="4" height="10" fill={color} opacity="0.7" />
          {/* Waves */}
          <path
            d="M6 72 Q18 68 30 72 T54 72 T78 72 T96 72"
            stroke={color}
            strokeWidth="1.4"
            fill="none"
            opacity="0.55"
          />
          <path
            d="M6 80 Q18 76 30 80 T54 80 T78 80 T96 80"
            stroke={color}
            strokeWidth="1.4"
            fill="none"
            opacity="0.35"
          />
        </svg>
      );

    case "holiday":
      // Sun + single palm frond.
      return (
        <svg {...common}>
          <circle cx="60" cy="32" r="14" fill={color} opacity="0.22" />
          <circle cx="60" cy="32" r="9" fill={color} opacity="0.85" />
          {/* Palm trunk */}
          <path
            d="M30 86 Q26 60 22 36"
            stroke={color}
            strokeWidth="2.2"
            fill="none"
            opacity="0.85"
            strokeLinecap="round"
          />
          {/* Palm fronds */}
          <path
            d="M22 36 Q10 30 4 38"
            stroke={color}
            strokeWidth="1.6"
            fill="none"
            opacity="0.7"
            strokeLinecap="round"
          />
          <path
            d="M22 36 Q26 22 38 20"
            stroke={color}
            strokeWidth="1.6"
            fill="none"
            opacity="0.7"
            strokeLinecap="round"
          />
          <path
            d="M22 36 Q14 44 8 56"
            stroke={color}
            strokeWidth="1.6"
            fill="none"
            opacity="0.55"
            strokeLinecap="round"
          />
          <path
            d="M22 36 Q34 36 44 44"
            stroke={color}
            strokeWidth="1.6"
            fill="none"
            opacity="0.55"
            strokeLinecap="round"
          />
        </svg>
      );

    case "nameday":
      // Laurel wreath — two opposing arcs of leaves.
      return (
        <svg {...common}>
          {[-1, 1].map((s) => (
            <g key={s} transform={`translate(48 50) scale(${s} 1)`}>
              <path
                d="M0 -28 Q20 -18 22 0 Q20 18 0 28"
                stroke={color}
                strokeWidth="1.4"
                fill="none"
                opacity="0.55"
              />
              {[-22, -10, 2, 14].map((y, i) => (
                <ellipse
                  key={i}
                  cx="20"
                  cy={y}
                  rx="6"
                  ry="3"
                  fill={color}
                  opacity={0.55 + (i % 2) * 0.2}
                  transform={`rotate(${-30 + i * 18} 20 ${y})`}
                />
              ))}
            </g>
          ))}
          <circle cx="48" cy="50" r="3" fill={color} opacity="0.8" />
        </svg>
      );

    case "weather-sun":
      // Sun with eight rays of varying length.
      return (
        <svg {...common}>
          <circle cx="48" cy="50" r="14" fill={color} opacity="0.85" />
          <circle cx="48" cy="50" r="22" stroke={color} strokeWidth="1" fill="none" opacity="0.25" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            const r1 = 26;
            const r2 = i % 2 === 0 ? 36 : 32;
            const x1 = 48 + Math.cos(a) * r1;
            const y1 = 50 + Math.sin(a) * r1;
            const x2 = 48 + Math.cos(a) * r2;
            const y2 = 50 + Math.sin(a) * r2;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.7"
              />
            );
          })}
        </svg>
      );

    case "weather-rain":
      // Cloud with three slanted raindrops.
      return (
        <svg {...common}>
          <path
            d="M22 50 Q22 38 34 38 Q38 28 50 30 Q64 30 66 42 Q78 42 78 52 Q78 60 70 60 L30 60 Q22 60 22 50 Z"
            fill={color}
            opacity="0.65"
          />
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${36 + i * 12} 70 L${30 + i * 12} 84`}
              stroke={color}
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity={0.75 - i * 0.12}
            />
          ))}
        </svg>
      );

    case "weather-cloud":
      // Single soft cloud, no rain.
      return (
        <svg {...common}>
          <path
            d="M16 58 Q16 44 30 44 Q34 32 48 34 Q64 34 66 48 Q82 48 82 60 Q82 70 72 70 L26 70 Q16 70 16 58 Z"
            fill={color}
            opacity="0.4"
          />
          <path
            d="M22 60 Q22 50 32 50 Q36 42 46 44 Q58 44 60 54 Q72 54 72 62 Q72 70 64 70 L30 70 Q22 70 22 60 Z"
            fill={color}
            opacity="0.85"
          />
        </svg>
      );

    case "rhythm":
      // Stylised clock — soft dial with two hands and tick marks.
      return (
        <svg {...common}>
          <circle cx="48" cy="50" r="26" stroke={color} strokeWidth="1.4" fill="none" opacity="0.5" />
          <circle cx="48" cy="50" r="20" fill={color} opacity="0.10" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            const r1 = 23;
            const r2 = i % 3 === 0 ? 19 : 21;
            return (
              <line
                key={i}
                x1={48 + Math.cos(a) * r2}
                y1={50 + Math.sin(a) * r2}
                x2={48 + Math.cos(a) * r1}
                y2={50 + Math.sin(a) * r1}
                stroke={color}
                strokeWidth={i % 3 === 0 ? 1.8 : 1}
                opacity="0.7"
                strokeLinecap="round"
              />
            );
          })}
          <line x1="48" y1="50" x2="48" y2="34" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
          <line x1="48" y1="50" x2="60" y2="54" stroke={color} strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
          <circle cx="48" cy="50" r="2.2" fill={color} />
        </svg>
      );
  }
}
