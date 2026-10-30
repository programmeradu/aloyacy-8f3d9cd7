// Avatar disc: initials when we know a name, otherwise a person glyph.
import { Icon } from "./Icon";
import { openMeSheet } from "./me-store";
import { useAuth } from "@/lib/useAuth";
import { useRoamI18n } from "@/lib/roam-i18n";
import { initialsOf } from "./initials";

export function Avatar({
  initials,
  size = 44,
  dark,
}: {
  initials: string;
  size?: number;
  dark?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full flex-none font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: dark ? "var(--r-char)" : "#fff",
        color: dark ? "#fff" : "var(--r-ink)",
      }}
    >
      {initials || <Icon name="user" size={size * 0.45} />}
    </span>
  );
}

/** The avatar button that opens the Me sheet. Frosted over the map, light on the canvas. */
export function AvatarButton({ variant = "light" }: { variant?: "frost" | "light" }) {
  const { user, isPermanent } = useAuth();
  const { r } = useRoamI18n();
  const name = isPermanent
    ? ((user?.user_metadata?.name as string | undefined) ?? user?.email?.split("@")[0] ?? "")
    : "";
  const ini = initialsOf(name);
  return (
    <button
      type="button"
      className={`r-fb r-fb--avatar${variant === "light" ? " r-fb--light" : ""}`}
      aria-label={r("me.open")}
      onClick={() => openMeSheet()}
    >
      {ini || <Icon name="user" size={20} />}
    </button>
  );
}
