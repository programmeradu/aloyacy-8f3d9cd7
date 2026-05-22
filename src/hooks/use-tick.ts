import { useEffect, useState } from "react";

/**
 * Returns a monotonically increasing counter that bumps every `intervalMs`.
 * Use to trigger re-renders for time-dependent UI (clocks, ETA recalc, etc.)
 * without manually wiring setInterval in every component.
 */
export function useTick(intervalMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}
