/**
 * A tiny, local-only log of the times this rider actually plans around, so the
 * planner's shortcuts can learn ("you usually want to be there by 18:45")
 * instead of shipping the same two hardcoded chips to everyone.
 *
 * Deliberately minimal: target time + intent kind, nothing about where they
 * went. Capped and self-pruning so it can never grow unbounded in storage.
 */

import { useEffect, useState } from "react";
import type { TimeUsage } from "@aloya/core/time-presets";

const KEY = "aloya:time-history";
const MAX_ENTRIES = 60;
const MAX_AGE_MS = 120 * 24 * 60 * 60_000;
/** Don't log the same slot twice while the rider is fiddling with the picker. */
const DUPLICATE_MS = 10 * 60_000;

function read(): TimeUsage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (u): u is TimeUsage =>
        !!u &&
        typeof u === "object" &&
        typeof (u as TimeUsage).atMs === "number" &&
        Number.isFinite((u as TimeUsage).atMs) &&
        now - (u as TimeUsage).atMs < MAX_AGE_MS &&
        ((u as TimeUsage).mode === "leave" || (u as TimeUsage).mode === "arrive"),
    );
  } catch {
    return [];
  }
}

export function listTimeHistory(): TimeUsage[] {
  return read();
}

export function recordTimeUsage(usage: TimeUsage) {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(usage.atMs)) return;
  const all = read();
  if (all.some((u) => u.mode === usage.mode && Math.abs(u.atMs - usage.atMs) < DUPLICATE_MS)) return;
  const next = [usage, ...all].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent("aloya:time-history"));
}

/** Live view of the log — re-reads whenever a new usage is recorded. */
export function useTimeHistory(): TimeUsage[] {
  const [items, setItems] = useState<TimeUsage[]>([]);
  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener("aloya:time-history", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("aloya:time-history", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return items;
}
