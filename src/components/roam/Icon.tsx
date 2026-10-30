// Phosphor (regular) icon from the self-hosted icon font. Decorative by
// default; pass `label` when the icon is the only content of a control.
import type { CSSProperties } from "react";

export function Icon({
  name,
  size,
  className = "",
  style,
  label,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  label?: string;
}) {
  return (
    <i
      className={`ph ph-${name} ${className}`}
      style={size ? { fontSize: size, ...style } : style}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
