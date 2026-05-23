// Fullscreen interactive Street View sheet powered by mapillary-js.
// Loaded lazily — the heavy WebGL viewer only mounts when the user taps
// a turn thumbnail. Includes a thin Aloya-themed chrome (close button,
// label) so it doesn't break the editorial feel.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconArrowLeft } from "@/components/Icons";
// Bundle the viewer stylesheet directly — relying on a runtime <link> to
// unpkg was flaky on iOS / restricted networks and left the canvas at 0×0.
import "mapillary-js/dist/mapillary.css";

type Meta = { imageId: string; token: string };

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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<unknown>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch the image id once the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMeta(null);
    setError(null);
    const q = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      meta: "1",
    });
    if (heading != null) q.set("heading", String(heading));
    fetch(`/api/public/streetview?${q.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`No imagery (${r.status})`);
        return r.json() as Promise<Meta>;
      })
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      });
    return () => {
      cancelled = true;
    };
  }, [open, lat, lng, heading]);

  // Boot the viewer once we have meta + a host element.
  useEffect(() => {
    if (!open || !meta || !hostRef.current) return;
    let cancelled = false;
    let viewer: { remove: () => void; resize: () => void } | null = null;
    let resizeObs: ResizeObserver | null = null;

    const handleResize = () => viewer?.resize();

    (async () => {
      let mly: typeof import("mapillary-js");
      try {
        mly = await import("mapillary-js");
      } catch (e) {
        if (!cancelled) setError("Viewer failed to load");
        console.error("[streetview] mapillary-js import failed", e);
        return;
      }
      if (cancelled || !hostRef.current) return;
      try {
        viewer = new mly.Viewer({
          accessToken: meta.token,
          container: hostRef.current,
          imageId: meta.imageId,
          component: {
            cover: false,
            sequence: true,
            direction: true,
            zoom: true,
          },
        }) as unknown as { remove: () => void; resize: () => void };
      } catch (e) {
        if (!cancelled) setError("Viewer failed to start");
        console.error("[streetview] Viewer init failed", e);
        return;
      }
      viewerRef.current = viewer;

      // iOS Safari often mounts the WebGL canvas before layout settles —
      // poke resize on next frame, after a beat, and whenever the host
      // box or orientation changes.
      requestAnimationFrame(() => viewer?.resize());
      setTimeout(() => viewer?.resize(), 300);
      setTimeout(() => viewer?.resize(), 800);
      if (typeof ResizeObserver !== "undefined" && hostRef.current) {
        resizeObs = new ResizeObserver(() => viewer?.resize());
        resizeObs.observe(hostRef.current);
      }
      window.addEventListener("orientationchange", handleResize);
    })();


    return () => {
      cancelled = true;
      window.removeEventListener("orientationchange", handleResize);
      if (resizeObs) resizeObs.disconnect();
      if (viewer) {
        try {
          viewer.remove();
        } catch {
          /* noop */
        }
      }
      viewerRef.current = null;
    };
  }, [open, meta]);

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
      <div
        ref={hostRef}
        className="absolute inset-0 bg-ink"
        style={{ width: "100%", height: "100%" }}
      />

      {!meta && !error && (
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
