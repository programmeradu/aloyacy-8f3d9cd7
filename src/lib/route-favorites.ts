import { useEffect, useState } from "react";

export type StarredRoute = {
  routeId: string;
  routeShort: string;
  agency?: string;
  notifyDisruptions: boolean;
  starredAt: number;
};

const STARRED_KEY = "aloya:starred-routes";

function readStarred(): Record<string, StarredRoute> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STARRED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StarredRoute>) : {};
  } catch {
    return {};
  }
}

function writeStarred(data: Record<string, StarredRoute>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STARRED_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("aloya:starred-routes"));
  } catch {}
}

export function isRouteStarred(routeId: string): boolean {
  const all = readStarred();
  return !!all[routeId];
}

export function isRouteNotifyEnabled(routeId: string): boolean {
  const all = readStarred();
  return !!all[routeId]?.notifyDisruptions;
}

export function toggleStarredRoute(
  routeId: string,
  meta?: { routeShort?: string; agency?: string; notifyDisruptions?: boolean },
): boolean {
  const all = readStarred();
  const currentlyStarred = !!all[routeId];

  if (currentlyStarred) {
    delete all[routeId];
    writeStarred(all);
    return false;
  }

  all[routeId] = {
    routeId,
    routeShort: meta?.routeShort ?? routeId,
    agency: meta?.agency,
    notifyDisruptions: meta?.notifyDisruptions ?? true,
    starredAt: Date.now(),
  };
  writeStarred(all);
  return true;
}

export function setRouteNotifyDisruptions(routeId: string, notify: boolean) {
  const all = readStarred();
  if (!all[routeId]) return;
  all[routeId].notifyDisruptions = notify;
  writeStarred(all);
}

export function useStarredRoutes() {
  const [starred, setStarred] = useState<Record<string, StarredRoute>>(() => readStarred());

  useEffect(() => {
    function handleChange() {
      setStarred(readStarred());
    }
    window.addEventListener("aloya:starred-routes", handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener("aloya:starred-routes", handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  return starred;
}
