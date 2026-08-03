// Custom hand-drawn SVG iconography for Aloya.
// No Lucide / generic icon set — each icon is unique to the brand.
// Implementations live in ./icons; this stays a stable import surface.
//
// Barrel file: it re-exports components only, which the Fast Refresh rule
// cannot verify through `export *`. Disabling it here keeps the lint gate at
// zero warnings without weakening the rule anywhere real components live.
/* eslint-disable react-refresh/only-export-components */

export type { IconProps } from "./icons/icon-kit";

export * from "./icons/wayfinding";
export * from "./icons/weather";
export * from "./icons/actions";
export * from "./icons/filled";
