// Illustrated member avatars for the group page: a friendly, consistent
// character set drawn in SVG (no photos, no external services). Each member
// gets the same character every time, picked by hashing their member id.
// An optional mode badge (walking, bus, bike or scooter, taxi) sits on the
// bottom right; no badge when the mode is unknown.
import type { CSSProperties } from "react";
import type { MemberMode } from "@aloya/core/group-mode";

const BG = ["#FCE7B2", "#DCE8D2", "#D6E5F1", "#F6D8CC", "#E6DFF3", "#F0E3CC", "#D3ECE6"];
const SKIN = ["#F7D6B8", "#EDBF98", "#D49C72", "#A9714B", "#7A4E33"];
const HAIR = ["#2A201B", "#4E3322", "#8C5A2B", "#D2AB63", "#B1472F", "#3B3B3B"];
const SHIRT = ["#262626", "#F6B83C", "#5E806B", "#3F6B8C", "#C9694F", "#8A6CB1", "#E9E4DA"];

/** FNV-1a: small, fast and stable across runtimes. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type AvatarTraits = {
  bg: string;
  skin: string;
  hair: string;
  shirt: string;
  style: number;
  extra: number;
};

/** Deterministic character traits for a seed (member id). */
export function avatarTraits(seed: string): AvatarTraits {
  const h = hashSeed(seed || "guest");
  const pick = <T,>(arr: readonly T[], shift: number) => arr[(h >>> shift) % arr.length];
  let shirt = pick(SHIRT, 9);
  const bg = pick(BG, 0);
  if (shirt === "#F6B83C" && bg === "#FCE7B2") shirt = "#262626";
  return {
    bg,
    skin: pick(SKIN, 3),
    hair: pick(HAIR, 6),
    shirt,
    style: (h >>> 12) % 6,
    extra: (h >>> 16) % 5,
  };
}

const MODE_META: Record<MemberMode, { icon: string; bg: string; fg: string; label: string }> = {
  walk: { icon: "person-simple-walk", bg: "#ffffff", fg: "#171717", label: "Walking" },
  bus: { icon: "bus", bg: "#F6B83C", fg: "#171717", label: "On the bus" },
  bike: { icon: "bicycle", bg: "#ffffff", fg: "#171717", label: "By bike or scooter" },
  taxi: { icon: "taxi", bg: "#171717", fg: "#ffffff", label: "In a taxi or car" },
};

export function modeLabel(mode: MemberMode | null | undefined): string | null {
  return mode ? MODE_META[mode].label : null;
}

function Hair({ t, back }: { t: AvatarTraits; back: boolean }) {
  const c = t.hair;
  switch (t.style) {
    case 0: // short crop
      return back ? null : (
        <path d="M20.6 29.5c-.6-9 4.6-14.3 11.4-14.3s12 5.3 11.4 14.3c-1.6-4.6-5.6-7.4-11.4-7.4s-9.8 2.8-11.4 7.4z" fill={c} />
      );
    case 1: // top bun
      return back ? (
        <circle cx="32" cy="13.4" r="5.4" fill={c} />
      ) : (
        <path d="M20.8 29c0-8.2 5-13.2 11.2-13.2S43.2 20.8 43.2 29c-2.8-3.6-6.6-5.4-11.2-5.4S23.6 25.4 20.8 29z" fill={c} />
      );
    case 2: // long
      return back ? (
        <path d="M19 31c0-10 5.8-16.4 13-16.4S45 21 45 31v13.6c-2.6 1.6-5.4 1.8-7.6.8V31H26.6v14.4c-2.2 1-5 .8-7.6-.8z" fill={c} />
      ) : (
        <path d="M20.6 30.4c0-9 5-14.2 11.4-14.2s11.4 5.2 11.4 14.2c-4.2-1.2-8.4-4.4-10.6-8-1.8 3.8-6.4 6.8-12.2 8z" fill={c} />
      );
    case 3: // curls
      return back ? null : (
        <g fill={c}>
          <circle cx="23.4" cy="25" r="4" />
          <circle cx="27" cy="19.6" r="4.4" />
          <circle cx="32.6" cy="17.6" r="4.6" />
          <circle cx="38" cy="20" r="4.4" />
          <circle cx="41" cy="25.4" r="3.8" />
        </g>
      );
    case 4: // side part
      return back ? null : (
        <path d="M20.8 29.8c-.4-8.8 4.8-14.4 12.2-14.4 6.4 0 10.6 4.6 10.2 11.2-6.4.2-13-2.2-16.6-6.2-.8 4.2-2.8 7.4-5.8 9.4z" fill={c} />
      );
    default: // beanie
      return back ? null : (
        <g>
          <path d="M20.2 27.4c0-8.6 5.2-13.8 11.8-13.8s11.8 5.2 11.8 13.8z" fill={t.shirt === "#E9E4DA" ? "#F6B83C" : "#E9E4DA"} />
          <rect x="19.4" y="24.6" width="25.2" height="4.6" rx="2.3" fill={t.shirt === "#262626" ? "#F6B83C" : "#262626"} />
        </g>
      );
  }
}

/** The character itself, as a round SVG. */
export function AvatarArt({ seed, size }: { seed: string; size: number }) {
  const t = avatarTraits(seed);
  const clip = `av-${hashSeed(seed).toString(36)}`;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill={t.bg} />
        <Hair t={t} back />
        <path d="M9 66c1.6-12.4 10.4-19.4 23-19.4S53.4 53.6 55 66z" fill={t.shirt} />
        <path d="M27.6 38h8.8v7.4c-1.2 2.4-7.6 2.4-8.8 0z" fill={t.skin} />
        <path d="M27.6 41.2c2.8 1.4 6 1.4 8.8 0v-3.2h-8.8z" fill="#000" opacity="0.08" />
        <ellipse cx="32" cy="30.4" rx="11" ry="12" fill={t.skin} />
        <ellipse cx="20.9" cy="31.4" rx="1.8" ry="2.6" fill={t.skin} />
        <ellipse cx="43.1" cy="31.4" rx="1.8" ry="2.6" fill={t.skin} />
        <Hair t={t} back={false} />
        <circle cx="27.8" cy="31.2" r="1.45" fill="#1d1d1b" />
        <circle cx="36.2" cy="31.2" r="1.45" fill="#1d1d1b" />
        <circle cx="25.4" cy="35" r="2" fill="#EE8E7A" opacity="0.32" />
        <circle cx="38.6" cy="35" r="2" fill="#EE8E7A" opacity="0.32" />
        <path d="M29 36.2c1.8 1.7 4.2 1.7 6 0" fill="none" stroke="#1d1d1b" strokeWidth="1.4" strokeLinecap="round" />
        {t.extra === 1 && (
          <g fill="none" stroke="#1d1d1b" strokeWidth="1.2">
            <circle cx="27.8" cy="31.2" r="3.3" />
            <circle cx="36.2" cy="31.2" r="3.3" />
            <path d="M31.1 31.2h1.8" />
          </g>
        )}
        {t.extra === 2 && <circle cx="21" cy="35" r="1.2" fill="#F6B83C" />}
      </g>
    </svg>
  );
}

/** Avatar disc with an optional ring colour and mode badge. */
export function MemberAvatar({
  seed,
  name,
  size = 40,
  ring,
  mode,
  style,
}: {
  seed: string;
  name?: string;
  size?: number;
  ring?: string;
  mode?: MemberMode | null;
  style?: CSSProperties;
}) {
  const meta = mode ? MODE_META[mode] : null;
  const badge = Math.max(16, Math.round(size * 0.44));
  return (
    <span
      role="img"
      aria-label={[name, meta?.label].filter(Boolean).join(", ") || undefined}
      title={name}
      style={{
        position: "relative",
        display: "inline-block",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
        ...style,
      }}
    >
      <AvatarArt seed={seed} size={size} />
      {meta && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -badge * 0.22,
            bottom: -badge * 0.12,
            width: badge,
            height: badge,
            borderRadius: "50%",
            background: meta.bg,
            color: meta.fg,
            boxShadow: "0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,0.25)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <i className={`ph ph-${meta.icon}`} style={{ fontSize: badge * 0.62, lineHeight: 1 }} />
        </span>
      )}
    </span>
  );
}
