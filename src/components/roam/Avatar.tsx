// Avatar disc: the rider's own photo when their account has one, otherwise a
// neutral person pictogram. Never initials or letter tiles.
import { Icon } from "./Icon";
import { openMeSheet } from "./me-store";
import { useAuth } from "@/lib/useAuth";
import { useRoamI18n } from "@/lib/roam-i18n";

type MaybeUser = { user_metadata?: Record<string, unknown> | null } | null | undefined;

/** Profile photo url from the auth provider (Google sets avatar_url or picture). */
export function photoOf(user: MaybeUser): string | null {
  const m = user?.user_metadata ?? null;
  const url = (m?.avatar_url ?? m?.picture) as unknown;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

export function Avatar({
  photo,
  size = 44,
  dark,
}: {
  photo?: string | null;
  size?: number;
  dark?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center overflow-hidden rounded-full flex-none"
      style={{
        width: size,
        height: size,
        background: dark ? "var(--r-char)" : "#fff",
        color: dark ? "#fff" : "var(--r-ink)",
      }}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <Icon name="user" size={size * 0.45} />
      )}
    </span>
  );
}

/** The avatar button that opens the Me sheet. Frosted over the map, light on the canvas. */
export function AvatarButton({ variant = "light" }: { variant?: "frost" | "light" }) {
  const { user, isPermanent } = useAuth();
  const { r } = useRoamI18n();
  const photo = isPermanent ? photoOf(user) : null;
  return (
    <button
      type="button"
      className={`r-fb r-fb--avatar${variant === "light" ? " r-fb--light" : ""}`}
      aria-label={r("me.open")}
      onClick={() => openMeSheet()}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          width={44}
          height={44}
          referrerPolicy="no-referrer"
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <Icon name="user" size={20} />
      )}
    </button>
  );
}
