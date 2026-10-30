// A tab or installed PWA opened before a deploy still runs the old bundle.
// Its lazy chunks (the map library, the scanner engines) were renamed by the
// new build and now 404, so a dynamic import fails ("Map unavailable").
// Reload once to pick up the new build; a session guard stops a reload loop.
const KEY = "aloya:stale-reload";

export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch|ChunkLoadError|Unable to preload CSS|text\/html/i.test(
    msg,
  );
}

/** Reload the page at most once a minute. Returns true when a reload started. */
export function reloadForNewDeploy(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
