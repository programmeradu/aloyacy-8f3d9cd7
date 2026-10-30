// Frosted circular button (Roam). Renders a <button> or, with `to`, a router
// Link. Always 44px or larger, always labelled.
import { forwardRef, type ReactNode } from "react";
import type React from "react";
import { Link } from "@tanstack/react-router";
import { Icon } from "./Icon";

export type FrostVariant = "frost" | "light" | "white" | "y";

type Common = {
  icon?: string;
  label: string;
  variant?: FrostVariant;
  large?: boolean;
  badge?: number | string | null;
  badgeDark?: boolean;
  className?: string;
  children?: ReactNode;
};

function cls(variant: FrostVariant, large?: boolean, extra = "") {
  const v = variant === "frost" ? "" : ` r-fb--${variant}`;
  return `r-fb${v}${large ? " r-fb--lg" : ""} ${extra}`.trim();
}

function Inner({
  icon,
  badge,
  badgeDark,
  children,
}: Pick<Common, "icon" | "badge" | "badgeDark" | "children">) {
  return (
    <>
      {icon ? <Icon name={icon} /> : children}
      {badge != null && badge !== 0 ? (
        <span className={`r-badge${badgeDark ? " r-badge--k" : ""}`} aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </>
  );
}

export const FrostButton = forwardRef<
  HTMLButtonElement,
  Common & { onClick?: () => void; pressed?: boolean; type?: "button" | "submit" }
>(function FrostButton(
  {
    icon,
    label,
    variant = "frost",
    large,
    badge,
    badgeDark,
    className,
    children,
    onClick,
    pressed,
    type = "button",
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cls(variant, large, className)}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Inner icon={icon} badge={badge} badgeDark={badgeDark}>
        {children}
      </Inner>
    </button>
  );
});

/** Link variant. `to` and `params` are passed straight to the router. */
export function FrostLink({
  icon,
  label,
  variant = "frost",
  large,
  badge,
  badgeDark,
  className,
  children,
  to,
  params,
  search,
}: Common & { to: string; params?: Record<string, string>; search?: Record<string, unknown> }) {
  // Route strings come from callers at runtime, so the typed-route props are
  // passed through untyped on purpose.
  const linkProps = { to, params, search } as unknown as React.ComponentProps<typeof Link>;
  return (
    <Link {...linkProps} className={cls(variant, large, className)} aria-label={label}>
      <Inner icon={icon} badge={badge} badgeDark={badgeDark}>
        {children}
      </Inner>
    </Link>
  );
}

/** Back button: history back when there is history, else the given fallback route. */
export function BackButton({
  label,
  variant = "frost",
  fallback = "/",
}: {
  label: string;
  variant?: FrostVariant;
  fallback?: string;
}) {
  return (
    <FrostButton
      icon="caret-left"
      label={label}
      variant={variant}
      onClick={() => {
        if (typeof window === "undefined") return;
        if (window.history.length > 1) window.history.back();
        else window.location.assign(fallback);
      }}
    />
  );
}
