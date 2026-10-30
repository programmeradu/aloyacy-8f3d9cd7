// Visible imagery attribution chip. Required by the basemap provider; keep it
// on screen whenever a map is visible (BASEMAP in src/lib/basemap.ts).
import { basemapAttribution } from "@/lib/basemap";

export function MapAttribution({ bottom = 8, top }: { bottom?: number; top?: number | string }) {
  const items = basemapAttribution();
  return (
    <div className="r-attrib" style={top != null ? { top } : { bottom }}>
      {items.map((it, i) => (
        <span key={it.href}>
          {i > 0 ? " · " : ""}
          <a href={it.href} target="_blank" rel="noreferrer noopener">
            {it.text}
          </a>
        </span>
      ))}
    </div>
  );
}
