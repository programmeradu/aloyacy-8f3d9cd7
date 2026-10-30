// Illustrated member avatars for the group page, drawn in SVG (no photos, no
// external services). Riders CHOOSE their character (AVATAR_CHOICES: people of
// many looks, plus neutral animals); nothing is guessed about them. Until they
// choose, everyone gets a neutral, non-gendered face whose colour comes from
// their member id so people stay distinguishable.
// An optional mode badge (walking, bus, bike or scooter, taxi) sits on the
// bottom right; no badge when the mode is unknown.
import type { CSSProperties, ReactNode } from "react";
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
        <path
          d="M20.6 29.5c-.6-9 4.6-14.3 11.4-14.3s12 5.3 11.4 14.3c-1.6-4.6-5.6-7.4-11.4-7.4s-9.8 2.8-11.4 7.4z"
          fill={c}
        />
      );
    case 1: // top bun
      return back ? (
        <circle cx="32" cy="13.4" r="5.4" fill={c} />
      ) : (
        <path
          d="M20.8 29c0-8.2 5-13.2 11.2-13.2S43.2 20.8 43.2 29c-2.8-3.6-6.6-5.4-11.2-5.4S23.6 25.4 20.8 29z"
          fill={c}
        />
      );
    case 2: // long
      return back ? (
        <path
          d="M19 31c0-10 5.8-16.4 13-16.4S45 21 45 31v13.6c-2.6 1.6-5.4 1.8-7.6.8V31H26.6v14.4c-2.2 1-5 .8-7.6-.8z"
          fill={c}
        />
      ) : (
        <path
          d="M20.6 30.4c0-9 5-14.2 11.4-14.2s11.4 5.2 11.4 14.2c-4.2-1.2-8.4-4.4-10.6-8-1.8 3.8-6.4 6.8-12.2 8z"
          fill={c}
        />
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
        <path
          d="M20.8 29.8c-.4-8.8 4.8-14.4 12.2-14.4 6.4 0 10.6 4.6 10.2 11.2-6.4.2-13-2.2-16.6-6.2-.8 4.2-2.8 7.4-5.8 9.4z"
          fill={c}
        />
      );
    default: // beanie
      return back ? null : (
        <g>
          <path
            d="M20.2 27.4c0-8.6 5.2-13.8 11.8-13.8s11.8 5.2 11.8 13.8z"
            fill={t.shirt === "#E9E4DA" ? "#F6B83C" : "#E9E4DA"}
          />
          <rect
            x="19.4"
            y="24.6"
            width="25.2"
            height="4.6"
            rx="2.3"
            fill={t.shirt === "#262626" ? "#F6B83C" : "#262626"}
          />
        </g>
      );
  }
}

type Preset =
  | { kind: "person"; label: string; t: AvatarTraits }
  | { kind: "animal"; label: string; animal: "fox" | "owl" | "cat" | "bear" | "panda" };

const P = (
  label: string,
  bg: string,
  skin: string,
  hair: string,
  shirt: string,
  style: number,
  extra = 0,
): Preset => ({
  kind: "person",
  label,
  t: { bg, skin, hair, shirt, style, extra },
});

/** The picker's set, in display order. Ids are stored, so never renumber. */
export const AVATAR_PRESETS: Record<string, Preset> = {
  p1: P("Short hair", "#D6E5F1", "#EDBF98", "#2A201B", "#262626", 0),
  p2: P("Bun", "#FCE7B2", "#A9714B", "#2A201B", "#5E806B", 1),
  p3: P("Long hair", "#F6D8CC", "#F7D6B8", "#8C5A2B", "#3F6B8C", 2),
  p4: P("Curls", "#DCE8D2", "#7A4E33", "#2A201B", "#F6B83C", 3),
  p5: P("Side part, glasses", "#E6DFF3", "#D49C72", "#4E3322", "#C9694F", 4, 1),
  p6: P("Beanie", "#F0E3CC", "#EDBF98", "#3B3B3B", "#262626", 5),
  p7: P("Long red hair", "#D3ECE6", "#F7D6B8", "#B1472F", "#8A6CB1", 2, 2),
  p8: P("Curls, glasses", "#FCE7B2", "#A9714B", "#3B3B3B", "#3F6B8C", 3, 1),
  p9: P("Grey crop", "#D6E5F1", "#D49C72", "#BDBDB8", "#5E806B", 0, 1),
  p10: P("Blonde bun", "#F6D8CC", "#F7D6B8", "#D2AB63", "#262626", 1),
  a1: { kind: "animal", label: "Fox", animal: "fox" },
  a2: { kind: "animal", label: "Owl", animal: "owl" },
  a3: { kind: "animal", label: "Cat", animal: "cat" },
  a4: { kind: "animal", label: "Bear", animal: "bear" },
  a5: { kind: "animal", label: "Panda", animal: "panda" },
};
export const AVATAR_CHOICES = Object.keys(AVATAR_PRESETS);

export function isAvatarChoice(v: unknown): v is string {
  return typeof v === "string" && v in AVATAR_PRESETS;
}

function Clip({ id, children, size }: { id: string; children: ReactNode; size: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <defs>
        <clipPath id={id}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </svg>
  );
}

function Person({ t }: { t: AvatarTraits }) {
  return (
    <>
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
      <path
        d="M29 36.2c1.8 1.7 4.2 1.7 6 0"
        fill="none"
        stroke="#1d1d1b"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {t.extra === 1 && (
        <g fill="none" stroke="#1d1d1b" strokeWidth="1.2">
          <circle cx="27.8" cy="31.2" r="3.3" />
          <circle cx="36.2" cy="31.2" r="3.3" />
          <path d="M31.1 31.2h1.8" />
        </g>
      )}
      {t.extra === 2 && <circle cx="21" cy="35" r="1.2" fill="#F6B83C" />}
    </>
  );
}

const EYES = (y = 31, dx = 6, r = 1.8) => (
  <>
    <circle cx={32 - dx} cy={y} r={r} fill="#1d1d1b" />
    <circle cx={32 + dx} cy={y} r={r} fill="#1d1d1b" />
  </>
);

function Animal({ a }: { a: "fox" | "owl" | "cat" | "bear" | "panda" }) {
  switch (a) {
    case "fox":
      return (
        <>
          <rect width="64" height="64" fill="#FCE7B2" />
          <path d="M14 14l12 10-6 6zM50 14L38 24l6 6z" fill="#D9762F" />
          <path
            d="M12 28c4-8 12-12 20-12s16 4 20 12c-2 12-10 22-20 22S14 40 12 28z"
            fill="#E8893A"
          />
          <path
            d="M20 34c4 0 8 3 12 10 4-7 8-10 12-10-2 8-6 14-12 14s-10-6-12-14z"
            fill="#FFF6EA"
          />
          {EYES(31, 7, 1.7)}
          <circle cx="32" cy="43" r="2" fill="#1d1d1b" />
        </>
      );
    case "owl":
      return (
        <>
          <rect width="64" height="64" fill="#DCE8D2" />
          <path d="M14 20l8 6M50 20l-8 6" stroke="#7A5A3A" strokeWidth="4" strokeLinecap="round" />
          <ellipse cx="32" cy="38" rx="19" ry="21" fill="#9C7650" />
          <circle cx="25" cy="32" r="7" fill="#FFF6EA" />
          <circle cx="39" cy="32" r="7" fill="#FFF6EA" />
          <circle cx="25" cy="32" r="2.6" fill="#1d1d1b" />
          <circle cx="39" cy="32" r="2.6" fill="#1d1d1b" />
          <path d="M30 38h4l-2 4z" fill="#F6B83C" />
          <path d="M22 48c3 2 6 3 10 3s7-1 10-3" stroke="#C9A57E" strokeWidth="2" fill="none" />
        </>
      );
    case "cat":
      return (
        <>
          <rect width="64" height="64" fill="#E6DFF3" />
          <path d="M15 16l4 15 9-7zM49 16l-4 15-9-7z" fill="#5B5B5B" />
          <ellipse cx="32" cy="35" rx="17" ry="15" fill="#6E6E6E" />
          <ellipse cx="32" cy="40" rx="7" ry="5" fill="#ECECEC" />
          <path d="M29.5 38h5L32 40.5z" fill="#EE8E7A" />
          <circle cx="25.5" cy="32" r="2.2" fill="#F6B83C" />
          <circle cx="38.5" cy="32" r="2.2" fill="#F6B83C" />
          <path d="M18 39h7M18 42l7-1M46 39h-7M46 42l-7-1" stroke="#ECECEC" strokeWidth="1" />
        </>
      );
    case "bear":
      return (
        <>
          <rect width="64" height="64" fill="#F0E3CC" />
          <circle cx="18" cy="20" r="7" fill="#8C5A2B" />
          <circle cx="46" cy="20" r="7" fill="#8C5A2B" />
          <circle cx="32" cy="35" r="18" fill="#9E6A38" />
          <ellipse cx="32" cy="41" rx="8" ry="6" fill="#E7C9A0" />
          <ellipse cx="32" cy="38.5" rx="2.6" ry="2" fill="#1d1d1b" />
          {EYES(31, 7, 1.8)}
        </>
      );
    default:
      return (
        <>
          <rect width="64" height="64" fill="#D3ECE6" />
          <circle cx="18" cy="20" r="7" fill="#262626" />
          <circle cx="46" cy="20" r="7" fill="#262626" />
          <circle cx="32" cy="35" r="18" fill="#FFFFFF" />
          <ellipse cx="25" cy="33" rx="5" ry="6" fill="#262626" transform="rotate(-20 25 33)" />
          <ellipse cx="39" cy="33" rx="5" ry="6" fill="#262626" transform="rotate(20 39 33)" />
          <circle cx="25.5" cy="32.5" r="1.4" fill="#fff" />
          <circle cx="38.5" cy="32.5" r="1.4" fill="#fff" />
          <ellipse cx="32" cy="40.5" rx="2.4" ry="1.8" fill="#262626" />
        </>
      );
  }
}

const NEUTRAL_BG = ["#FCE7B2", "#DCE8D2", "#D6E5F1", "#F6D8CC", "#E6DFF3", "#F0E3CC", "#D3ECE6"];
const NEUTRAL_FACE = ["#F6B83C", "#262626", "#5E806B", "#3F6B8C", "#C9694F", "#8A6CB1"];

/** Default before a rider chooses: a calm round face, no hair, no gender cues. */
function Neutral({ seed }: { seed: string }) {
  const h = hashSeed(seed || "guest");
  const bg = NEUTRAL_BG[h % NEUTRAL_BG.length];
  const face = NEUTRAL_FACE[(h >>> 5) % NEUTRAL_FACE.length];
  const ink = face === "#262626" || face === "#3F6B8C" || face === "#8A6CB1" ? "#fff" : "#1d1d1b";
  return (
    <>
      <rect width="64" height="64" fill={bg} />
      <circle cx="32" cy="34" r="19" fill={face} />
      <circle cx="25.5" cy="31.5" r="2" fill={ink} />
      <circle cx="38.5" cy="31.5" r="2" fill={ink} />
      <path
        d="M26.5 38.5c3 3 8 3 11 0"
        fill="none"
        stroke={ink}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  );
}

/** The character itself, as a round SVG. */
export function AvatarArt({
  seed,
  size,
  choice,
}: {
  seed: string;
  size: number;
  choice?: string | null;
}) {
  const preset = choice && isAvatarChoice(choice) ? AVATAR_PRESETS[choice] : null;
  const clip = `av-${hashSeed(`${seed}:${choice ?? ""}`).toString(36)}`;
  return (
    <Clip id={clip} size={size}>
      {preset?.kind === "person" ? (
        <Person t={preset.t} />
      ) : preset?.kind === "animal" ? (
        <Animal a={preset.animal} />
      ) : (
        <Neutral seed={seed} />
      )}
    </Clip>
  );
}

/** Avatar disc with an optional ring colour and mode badge. */
export function MemberAvatar({
  seed,
  choice,
  name,
  size = 40,
  ring,
  mode,
  style,
}: {
  seed: string;
  /** The rider's chosen character id (AVATAR_CHOICES); neutral default when unset. */
  choice?: string | null;
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
      <AvatarArt seed={seed} size={size} choice={choice} />
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
