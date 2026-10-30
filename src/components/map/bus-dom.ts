// DOM scaffolding for the animated bus overlay. Kept apart from
// AnimatedBus so the overlay class carries only motion state, and so the
// visual treatment (halo, boarding pulse, premium vs triangle art) can be
// read and tweaked in one place.

import busPremium from "@/assets/bus-premium.png";

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

/** Paint the rotor with either the premium bus art or a light triangle. */
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
      "radial-gradient(circle, color-mix(in oklab, #F6B83C 35%, transparent) 0%, transparent 65%)";
    glow.style.opacity = focused ? "0.95" : "0";
    glow.style.transition = "opacity 240ms ease";
    glow.style.transform = "scale(1.6)";

    const img = document.createElement("img");
    img.src = busPremium;
    img.alt = "";
    img.draggable = false;
    img.style.position = "absolute";
    img.style.inset = "0";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.filter = focused
      ? "drop-shadow(0 6px 10px rgba(20,20,20,0.35))"
      : "drop-shadow(0 3px 6px rgba(20,20,20,0.28))";
    rotor.appendChild(glow);
    rotor.appendChild(img);
  } else {
    // Lightweight directional triangle. Points "up" by default — the rotor
    // applies the bearing, matching the premium asset's convention.
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.filter = "drop-shadow(0 1px 2px rgba(20,20,20,0.35))";
    const tri = document.createElementNS(svgNS, "path");
    tri.setAttribute("d", "M12 3 L19 19 L12 16 L5 19 Z");
    tri.setAttribute("fill", "#262626"); // aegean-deep
    tri.setAttribute("stroke", "#ffffff");
    tri.setAttribute("stroke-width", "1.5");
    tri.setAttribute("stroke-linejoin", "round");
    svg.appendChild(tri);
    rotor.appendChild(svg);
  }
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
