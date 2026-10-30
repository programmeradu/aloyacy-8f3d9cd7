// DOM scaffolding for the animated bus overlay. Kept apart from
// AnimatedBus so the overlay class carries only motion state, and so the
// visual treatment (halo, boarding pulse, premium vs triangle art) can be
// read and tweaked in one place.

import { BUS_SHADOW, busGlyphSvg } from "./bus-glyph";

export type BusElements = {
  el: HTMLDivElement;
  halo: HTMLDivElement;
  boardingRing: HTMLDivElement;
  rotor: HTMLDivElement;
};

/** Build the overlay node tree for one bus. Caller positions and sizes it. */
export function createBusElements(label: string): BusElements {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.willChange = "transform";
  el.style.pointerEvents = "none";
  el.style.transformOrigin = "center center";
  el.title = label;

  const halo = document.createElement("div");
  halo.style.position = "absolute";
  halo.style.inset = "-18%";
  halo.style.borderRadius = "50%";
  halo.style.border = "2px solid color-mix(in oklab, #F6B83C 65%, transparent)";
  halo.style.background =
    "radial-gradient(circle, color-mix(in oklab, #F6B83C 18%, transparent) 0%, transparent 70%)";
  halo.style.opacity = "0";
  halo.style.transition = "opacity 240ms ease";
  halo.style.pointerEvents = "none";

  // Boarding ring — concentric pulse shown when the bus is stationary
  // at a stop (picking up / dropping off). Uses inline keyframes so we
  // don't have to inject CSS globally.
  ensureBoardingKeyframes();
  const boardingRing = document.createElement("div");
  boardingRing.style.position = "absolute";
  boardingRing.style.inset = "-35%";
  boardingRing.style.borderRadius = "50%";
  boardingRing.style.border = "2px solid color-mix(in oklab, #262626 80%, transparent)";
  boardingRing.style.opacity = "0";
  boardingRing.style.pointerEvents = "none";
  boardingRing.style.transformOrigin = "center center";

  const rotor = document.createElement("div");
  rotor.style.position = "absolute";
  rotor.style.inset = "0";
  rotor.style.width = "100%";
  rotor.style.height = "100%";
  rotor.style.transformOrigin = "center center";

  el.appendChild(halo);
  el.appendChild(boardingRing);
  el.appendChild(rotor);

  return { el, halo, boardingRing, rotor };
}

/**
 * Paint the rotor with the Roam bus glyph (top-down, brand yellow). "premium"
 * is the close-up size with a focus glow; "triangle" is the small fleet size
 * (name kept for callers), the same glyph without the glow.
 */
export function renderBusVariant(
  rotor: HTMLDivElement,
  variant: "premium" | "triangle",
  focused: boolean,
): void {
  rotor.innerHTML = "";
  if (variant === "premium") {
    const glow = document.createElement("div");
    glow.style.position = "absolute";
    glow.style.inset = "0";
    glow.style.borderRadius = "50%";
    glow.style.background =
      "radial-gradient(circle, color-mix(in oklab, #F6B83C 40%, transparent) 0%, transparent 62%)";
    glow.style.opacity = focused ? "0.9" : "0";
    glow.style.transition = "opacity 240ms ease";
    glow.style.transform = "scale(1.5)";
    rotor.appendChild(glow);
  }
  const art = document.createElement("div");
  art.style.position = "absolute";
  art.style.inset = "0";
  art.style.filter = BUS_SHADOW;
  art.innerHTML = busGlyphSvg();
  rotor.appendChild(art);
}

/** Line-number badge that stays upright beside the bus (not rotated). */
export function setBusBadge(el: HTMLDivElement, text: string | null): void {
  let b = el.querySelector<HTMLSpanElement>("[data-bus-badge]");
  if (!text) {
    b?.remove();
    return;
  }
  if (!b) {
    b = document.createElement("span");
    b.dataset.busBadge = "1";
    Object.assign(b.style, {
      position: "absolute",
      top: "-2px",
      right: "-8px",
      minWidth: "20px",
      height: "18px",
      padding: "0 5px",
      borderRadius: "9px",
      background: "#171717",
      color: "#ffffff",
      border: "1.5px solid #ffffff",
      boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
      font: "600 11px/15px Urbanist, ui-sans-serif, system-ui, sans-serif",
      textAlign: "center",
      boxSizing: "border-box",
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(b);
  }
  if (b.textContent !== text) b.textContent = text;
}

// Inject the boarding-pulse keyframes once per page load. Keeps the
// animation purely CSS-driven so React + the rAF loop stay lean.
let boardingKeyframesInjected = false;
function ensureBoardingKeyframes() {
  if (boardingKeyframesInjected || typeof document === "undefined") return;
  boardingKeyframesInjected = true;
  const style = document.createElement("style");
  style.textContent = `@keyframes aloya-board-pulse {
    0%   { transform: scale(0.75); opacity: 0.85; }
    70%  { transform: scale(1.45); opacity: 0; }
    100% { transform: scale(1.45); opacity: 0; }
  }`;
  document.head.appendChild(style);
}
