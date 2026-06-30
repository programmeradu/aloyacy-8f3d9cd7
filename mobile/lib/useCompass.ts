// Native compass heading via expo-sensors Magnetometer.
// Mirrors the web `useCompass` contract: heading in degrees clockwise from
// magnetic north (close enough to true north on Cyprus — local declination
// ≈ 4°E, well inside our smoothing band). Returns null until sensors yield
// real data so the HUD can fall back to GPS-derived heading.
//
// Permissions: on iOS the magnetometer is permission-free for foreground
// reads; Android exposes it without a runtime prompt. We still expose a
// `permission` field for API parity with the web hook.

import { useEffect, useRef, useState } from "react";
import { Magnetometer, type MagnetometerMeasurement } from "expo-sensors";

export type CompassState = {
  /** Heading in degrees clockwise from magnetic north, or null when not ready. */
  headingDeg: number | null;
  /** Whether the device exposes a magnetometer. */
  supported: boolean;
  /** Permission state — always "granted" on iOS/Android in foreground. */
  permission: "granted" | "denied" | "prompt";
};

// Low-pass filter alpha — higher = snappier, lower = smoother. 0.25 matches
// the web implementation so HUD rotation feels identical across platforms.
const LPF_ALPHA = 0.25;

// Magnetometer sample interval (ms). 100ms = 10Hz, plenty for a compass dial.
const SAMPLE_INTERVAL_MS = 100;

export function useCompass(enabled: boolean): CompassState {
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);
  const smoothedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let sub: { remove: () => void } | null = null;

    (async () => {
      try {
        const available = await Magnetometer.isAvailableAsync();
        if (cancelled) return;
        if (!available) {
          setSupported(false);
          return;
        }
        Magnetometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
        sub = Magnetometer.addListener((m: MagnetometerMeasurement) => {
          // Atan2(y, x) gives the angle from the X axis; convert to
          // compass heading (0 = north, clockwise positive).
          const rad = Math.atan2(m.y, m.x);
          let h = (rad * 180) / Math.PI;
          // Rotate so 0° = magnetic north (device top pointing north).
          h = 90 - h;
          h = ((h % 360) + 360) % 360;

          const prev = smoothedRef.current;
          const next =
            prev == null ? h : prev + shortestArc(prev, h) * LPF_ALPHA;
          smoothedRef.current = ((next % 360) + 360) % 360;
          setHeadingDeg(smoothedRef.current);
        });
      } catch {
        if (!cancelled) setSupported(false);
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);

  return { headingDeg, supported, permission: "granted" };
}

/** API parity with web — native has no extra permission step. */
export async function requestCompassPermission(): Promise<
  "granted" | "denied" | "unsupported"
> {
  try {
    const ok = await Magnetometer.isAvailableAsync();
    return ok ? "granted" : "unsupported";
  } catch {
    return "unsupported";
  }
}

function shortestArc(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}
