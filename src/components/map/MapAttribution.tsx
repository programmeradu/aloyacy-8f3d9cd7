// Imagery attribution the basemap provider requires (BASEMAP in
// src/lib/basemap.ts). Collapsed to a small "i" button that expands to the
// full credit line on tap, the same pattern as Mapbox's compact attribution,
// so it stays on every map without covering it.
import { useEffect, useState } from "react";
import { basemapAttribution } from "@/lib/basemap";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/roam/Icon";

export function MapAttribution({
  bottom = 8,
  top,
  inline,
}: {
  bottom?: number;
  top?: number | string;
  /** Render in the page flow (e.g. above the Now card) instead of over the map. */
  inline?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setOpen(false), 8000);
    return () => window.clearTimeout(id);
  }, [open]);
  const items = basemapAttribution();
  return (
    <div
      className={`r-attrib${inline ? " r-attrib--inline" : ""}${open ? " is-open" : ""}`}
      style={inline ? undefined : top != null ? { top } : { bottom }}
    >
      {open ? (
        <span className="r-attrib-text">
          {items.map((it, i) => (
            <span key={it.href}>
              {i > 0 ? " · " : ""}
              <a href={it.href} target="_blank" rel="noreferrer noopener">
                {it.text}
              </a>
            </span>
          ))}
        </span>
      ) : null}
      <button
        type="button"
        className="r-attrib-btn"
        aria-expanded={open}
        aria-label={t("map.credits")}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="info" size={14} />
      </button>
    </div>
  );
}
