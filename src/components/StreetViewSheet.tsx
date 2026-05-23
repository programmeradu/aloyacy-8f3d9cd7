// Fullscreen Street View sheet. Renders the Mapillary JPEG returned by
// our server proxy. We intentionally do NOT boot the interactive
// mapillary-js viewer here because that would require exposing the
// Mapillary access token to the browser — a server secret that must
// stay server-side.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconArrowLeft } from "@/components/Icons";

export function StreetViewSheet({
  open,
  onClose,
  lat,
  lng,
  heading,
  label,
}: {
  open: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  heading?: number;
  label?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSrc(null);
    setError(null);
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (heading != null) q.set("heading", String(heading));
    // HEAD-check via GET; if the proxy 404s we show the no-coverage state.
    const url = `/api/public/streetview?${q.toString()}`;
    let cancelled = false;
    fetch(url, { method: "GET" })
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setError(`No imagery (${r.status})`);
          return;
        }
        setSrc(url);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      });
    return () => {
      cancelled = true;
    };
  }, [open, lat, lng, heading]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-ink">
      {src && !error && (
        <img
          src={src}
          alt={label ?? "Street view"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {!src && !error && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/70">
            Loading street view…
          </p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
              No coverage
            </p>
            <p className="mt-2 font-display text-xl text-limestone">
              No street imagery exists for this point.
            </p>
          </div>
        </div>
      )}

      {/* Chrome */}
      <button
        type="button"
        onClick={onClose}
        className="absolute left-4 top-[max(16px,env(safe-area-inset-top))] z-10 flex items-center gap-2 rounded-full bg-limestone/90 px-3.5 py-2 text-ink shadow-lg ring-1 ring-ink/10 backdrop-blur transition hover:bg-limestone"
        aria-label="Close street view"
      >
        <IconArrowLeft className="size-4" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
          Close
        </span>
      </button>
      {label && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-10 px-6">
          <div className="mx-auto max-w-md rounded-2xl bg-ink/70 px-4 py-3 text-center backdrop-blur ring-1 ring-limestone/10">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/60">
              Street view
            </p>
            <p className="mt-0.5 font-display text-base text-limestone leading-snug">
              {label}
            </p>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
