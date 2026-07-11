// Shared type style for the native single-leg companion. The phase
// reasoning and every rider-facing string live in @aloya/core/single-leg-phase
// so web and native word the same trip identically.

export const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

export type { SingleLegPhase as Phase } from "@aloya/core/single-leg-phase";
