// Can this browser draw a Mapbox GL v3 map? v3 needs WebGL2. Checked once per
// page load on a throwaway canvas; the context is released straight away so
// it does not count against the browser's live context limit.
let cached: boolean | null = null;

export function hasWebGL2(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined") return true; // SSR: decide on the client
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    cached = !!gl;
    (
      gl?.getExtension("WEBGL_lose_context") as { loseContext?: () => void } | null
    )?.loseContext?.();
  } catch {
    cached = false;
  }
  return cached;
}
