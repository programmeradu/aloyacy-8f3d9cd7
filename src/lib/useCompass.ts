// Device compass heading. Works while the phone is stationary, complementing
// the GPS-derived heading (which only works while moving). On iOS Safari it
// requires a one-time user-gesture permission via
// DeviceOrientationEvent.requestPermission(). On Android (HTTPS) it just works.

import { useCallback, useEffect, useRef, useState } from "react";

type IOSOrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export type CompassState = {
  /** Heading in degrees clockwise from true north, or null when unavailable. */
  headingDeg: number | null;
  /** Whether the browser exposes the deviceorientation API. */
  supported: boolean;
  /** "granted" | "denied" | "prompt" — only meaningful on iOS. */
  permission: "granted" | "denied" | "prompt";
};

export function useCompass(enabled: boolean): CompassState {
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt">(
    "granted",
  );
  const supported =
    typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  const smoothedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !supported) return;
    const ctor = window.DeviceOrientationEvent as IOSOrientationCtor;
    if (typeof ctor.requestPermission === "function") {
      // iOS: assume denied until requestCompassPermission() is called.
      setPermission((p) => (p === "granted" ? "granted" : "prompt"));
    }
    const onOrient = (e: DeviceOrientationEvent) => {
      // webkitCompassHeading is iOS's true-north heading (0 = N).
      // alpha is rotation around z-axis — already compass-like on most
      // Android browsers when absolute=true; we accept it as a fallback.
      const webkit = (e as unknown as { webkitCompassHeading?: number })
        .webkitCompassHeading;
      let h: number | null = null;
      if (typeof webkit === "number" && !Number.isNaN(webkit)) {
        h = webkit;
      } else if (e.absolute && typeof e.alpha === "number") {
        h = 360 - e.alpha; // alpha is counter-clockwise
      }
      if (h == null) return;
      // Low-pass filter to kill jitter while still feeling responsive.
      const prev = smoothedRef.current;
      const next =
        prev == null
          ? h
          : prev + shortestArc(prev, h) * 0.25;
      smoothedRef.current = ((next % 360) + 360) % 360;
      setHeadingDeg(smoothedRef.current);
    };
    window.addEventListener("deviceorientation", onOrient, true);
    return () => window.removeEventListener("deviceorientation", onOrient, true);
  }, [enabled, supported]);

  return { headingDeg, supported, permission };
}

/** Trigger the iOS permission prompt. Must be called from a user gesture. */
export async function requestCompassPermission(): Promise<
  "granted" | "denied" | "unsupported"
> {
  if (typeof window === "undefined") return "unsupported";
  const ctor = window.DeviceOrientationEvent as IOSOrientationCtor | undefined;
  if (!ctor || typeof ctor.requestPermission !== "function") return "granted";
  try {
    const res = await ctor.requestPermission();
    return res;
  } catch {
    return "denied";
  }
}

function shortestArc(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}
