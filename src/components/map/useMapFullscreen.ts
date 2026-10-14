import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import type { MapboxApi } from "@/lib/useMapbox";

type Api = MapboxApi | null | undefined;

/**
 * Fullscreen behaviour for an inline map.
 *
 * Prefers the native Fullscreen API — the browser lifts the wrapper out of the
 * document so no ancestor transform or overflow can clip it, and the map host
 * node never gets re-parented. iOS Safari exposes neither
 * `requestFullscreen` on elements nor `exitFullscreen`, so it falls back to an
 * in-page fixed overlay, which needs extra work (below) to escape transformed
 * ancestors.
 */
export function useMapFullscreen(api: Api, mapRef: React.RefObject<mapboxgl.Map | null>) {
  const [expanded, setExpanded] = useState(false);
  const [fallbackOverlay, setFallbackOverlay] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const originalParentRef = useRef<HTMLElement | null>(null);
  const originalNextSiblingRef = useRef<Node | null>(null);

  const openFallback = useCallback(() => {
    const next = !expanded;
    setFallbackOverlay(next);
    setExpanded(next);
  }, [expanded]);

  const toggleFullscreen = useCallback(async () => {
    const wrap = wrapperRef.current;
    if (!wrap) return;
    const canNativeFs =
      typeof wrap.requestFullscreen === "function" &&
      typeof document.exitFullscreen === "function" &&
      document.fullscreenEnabled !== false;

    if (!canNativeFs) {
      openFallback();
      return;
    }
    try {
      if (!document.fullscreenElement) await wrap.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      openFallback();
    }
  }, [openFallback]);

  // Mirror browser-driven exits (Esc, system gesture) back into React state.
  useEffect(() => {
    const onChange = () => {
      const isFs = !!document.fullscreenElement;
      setExpanded((prev) => (fallbackOverlay ? prev : isFs));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fallbackOverlay]);

  // Fallback overlay: move the wrapper to <body> so it escapes clipping
  // ancestors, and put it back exactly where it came from on collapse.
  useLayoutEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;

    if (expanded && fallbackOverlay) {
      if (!originalParentRef.current) {
        originalParentRef.current = wrap.parentElement;
        originalNextSiblingRef.current = wrap.nextSibling;
      }
      if (wrap.parentElement !== document.body) document.body.appendChild(wrap);
      return;
    }

    const parent = originalParentRef.current;
    if (!parent || wrap.parentElement === parent) return;
    const nextSibling = originalNextSiblingRef.current;
    if (nextSibling && nextSibling.parentNode === parent) parent.insertBefore(wrap, nextSibling);
    else parent.appendChild(wrap);
  }, [expanded, fallbackOverlay]);

  // Clear the fallback flag a frame after collapsing, once re-parenting is done.
  useEffect(() => {
    if (expanded || !fallbackOverlay) return;
    const id = window.requestAnimationFrame(() => setFallbackOverlay(false));
    return () => window.cancelAnimationFrame(id);
  }, [expanded, fallbackOverlay]);

  // Lock body scroll and accept Esc while expanded.
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [expanded]);

  // iOS Safari fallback: an ancestor with transform/filter/perspective/contain
  // creates a containing block that traps our `position: fixed` wrapper, so the
  // map paints at the wrong size or not at all. Neutralize those properties for
  // the duration of the overlay and restore them exactly afterwards.
  useEffect(() => {
    if (!(expanded && fallbackOverlay)) return;
    const wrap = wrapperRef.current;
    if (!wrap) return;
    const restorers: Array<() => void> = [];
    let el: HTMLElement | null = wrap.parentElement;
    while (el && el !== document.body) {
      const cs = window.getComputedStyle(el);
      const needsFix =
        (cs.transform && cs.transform !== "none") ||
        (cs.filter && cs.filter !== "none") ||
        (cs.perspective && cs.perspective !== "none") ||
        cs.contain.includes("paint") ||
        cs.contain.includes("layout");
      if (needsFix) {
        const target = el;
        const prev = {
          transform: target.style.transform,
          filter: target.style.filter,
          perspective: target.style.perspective,
          contain: target.style.contain,
        };
        target.style.setProperty("transform", "none", "important");
        target.style.setProperty("filter", "none", "important");
        target.style.setProperty("perspective", "none", "important");
        target.style.setProperty("contain", "none", "important");
        restorers.push(() => {
          target.style.transform = prev.transform;
          target.style.filter = prev.filter;
          target.style.perspective = prev.perspective;
          target.style.contain = prev.contain;
        });
      }
      el = el.parentElement;
    }
    return () => restorers.forEach((r) => r());
  }, [expanded, fallbackOverlay]);

  // The container has new dimensions after every toggle; tell Mapbox to
  // re-measure on the next frame and again after the transition settles.
  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;
    const frame = requestAnimationFrame(() => m.resize());
    const timeout = window.setTimeout(() => m.resize(), 60);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [api, expanded, fallbackOverlay, mapRef]);

  return { expanded, fallbackOverlay, wrapperRef, toggleFullscreen };
}
