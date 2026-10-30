// Small Roam primitives: confidence tag, line pill, squiggle decoration and
// the white "studio" vehicle images.
import { useRoamI18n } from "@/lib/roam-i18n";
import { Icon } from "./Icon";

export type Confidence = "live" | "est" | "tt";

/** Confidence language: Live (yellow dot), Estimate (grey dot), Timetable (ring), always with the word. */
export function ConfTag({
  kind,
  pill,
  onDark,
}: {
  kind: Confidence;
  pill?: boolean;
  onDark?: boolean;
}) {
  const { r } = useRoamI18n();
  const mark =
    kind === "live" ? (
      <span className="r-dot" />
    ) : kind === "est" ? (
      <span className="r-dot r-dot--grey" />
    ) : (
      <span className="r-ring" />
    );
  const word = r(kind === "live" ? "conf.live" : kind === "est" ? "conf.est" : "conf.tt");
  if (pill)
    return (
      <span
        className="r-pill"
        style={onDark ? { background: "rgba(255,255,255,.12)", color: "#fff" } : undefined}
      >
        {mark}
        {word}
      </span>
    );
  return (
    <span className="r-conf" style={onDark ? { color: "var(--r-onchar-mute)" } : undefined}>
      {mark}
      {word}
    </span>
  );
}

export function LinePill({
  line,
  icon = "bus",
  tone = "grey",
  small,
}: {
  line: string;
  icon?: string;
  tone?: "grey" | "y" | "w" | "k";
  small?: boolean;
}) {
  const cls =
    tone === "y" ? " r-pill--y" : tone === "w" ? " r-pill--w" : tone === "k" ? " r-pill--k" : "";
  return (
    <span
      className={`r-pill${cls} r-tnum`}
      style={{ height: small ? 26 : 28, padding: "0 11px 0 9px", gap: 5, fontSize: 14 }}
    >
      <Icon name={icon} size={16} />
      {line}
    </span>
  );
}

export function Squiggle({
  width = 120,
  height = 44,
  fluid = false,
}: {
  width?: number;
  height?: number;
  /** Scale to the parent's width (never wider than it). */
  fluid?: boolean;
}) {
  const d =
    "M2 34 C 14 30, 18 40, 30 36 S 44 22, 52 30 S 64 40, 72 30 S 78 14, 88 18 S 100 26, 104 16 S 112 4, 118 10";
  return (
    <svg
      width={fluid ? "100%" : width}
      height={fluid ? undefined : height}
      viewBox="-6 -6 132 56"
      aria-hidden="true"
      style={
        fluid
          ? { display: "block", maxWidth: width, marginLeft: "auto" }
          : { overflow: "visible", display: "block" }
      }
    >
      <defs>
        <filter id="r-sq" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <linearGradient id="r-sqg" x1="0" x2="1">
          <stop offset="0" stopColor="#F6B83C" stopOpacity=".2" />
          <stop offset=".4" stopColor="#F6B83C" />
          <stop offset="1" stopColor="#F6B83C" />
        </linearGradient>
      </defs>
      <path
        d={d}
        fill="none"
        stroke="#F6B83C"
        strokeOpacity=".45"
        strokeWidth="6"
        filter="url(#r-sq)"
      />
      <path d={d} fill="none" stroke="url(#r-sqg)" strokeWidth="1.8" strokeLinecap="round" />
      <circle
        cx="88"
        cy="18"
        r="10"
        fill="rgba(246,184,60,.14)"
        stroke="#F6B83C"
        strokeOpacity=".7"
        strokeWidth="1"
      />
      <circle cx="88" cy="18" r="3.4" fill="#F6B83C" />
    </svg>
  );
}

export type Vehicle = "bus" | "intercity" | "coach" | "bike";
const VEH: Record<Vehicle, { src: string; w: number; h: number }> = {
  bus: { src: "/roam/bus-nicosia.webp", w: 360, h: 158 },
  intercity: { src: "/roam/bus-intercity.webp", w: 360, h: 158 },
  coach: { src: "/roam/coach.webp", w: 360, h: 166 },
  bike: { src: "/roam/bike.webp", w: 260, h: 178 },
};

export function VehicleImg({
  kind,
  width,
  className = "",
}: {
  kind: Vehicle;
  width: number;
  className?: string;
}) {
  const v = VEH[kind];
  return (
    <img
      src={v.src}
      alt=""
      width={width}
      height={Math.round((width * v.h) / v.w)}
      className={className}
      loading="lazy"
      decoding="async"
      style={{ objectFit: "contain" }}
    />
  );
}
