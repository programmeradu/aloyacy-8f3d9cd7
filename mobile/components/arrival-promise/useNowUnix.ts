import { useEffect, useState } from "react";

/**
 * Ticking unix clock (seconds).
 *
 * Arrival-promise copy is all relative ("leave in 6 min"), so the surfaces
 * re-render on their own cadence rather than waiting for new server data:
 * the commit CTA only needs a coarse tick, a live row needs a tighter one.
 */
export function useNowUnix(intervalMs: number): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
