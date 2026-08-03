// Shared primitives for the bespoke Aloya icon set.

export type IconProps = { className?: string; strokeWidth?: number };

export const iconClass = (className?: string) => `inline-block ${className ?? ""}`;
