// Bottom sheet (Roam): white notched top with a docked frosted close button,
// spring slide (reduced motion respected in roam.css), focus moved in on open
// and restored on close, Escape closes, background scroll locked.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import { NotchCard } from "./NotchCard";
import { FrostButton } from "./FrostButton";

type Props = {
  open: boolean;
  onClose: () => void;
  label: string;
  closeLabel: string;
  children: ReactNode;
  /** Sheet surface colour. */
  fill?: string;
  /** Open at the full snap point (detail views). */
  full?: boolean;
  /** Left of the notch in the sheet head (a detail view's Back), so the head is never an empty band. */
  headLeft?: ReactNode;
};

export function Sheet({
  open,
  onClose,
  label,
  closeLabel,
  children,
  fill = "#fff",
  full = false,
  headLeft,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const drag = useRef<{ y0: number; t0: number; last: number } | null>(null);
  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { y0: e.clientY, t0: performance.now(), last: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragY(0);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.last = e.clientY;
    const dy = e.clientY - drag.current.y0;
    // Follow the finger down; rubber-band upward drags.
    setDragY(dy < 0 ? dy / 4 : dy);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragY(null);
    if (!d) return;
    const dy = d.last - d.y0;
    const v = dy / Math.max(1, performance.now() - d.t0);
    if (dy > 120 || v > 0.6) {
      if (expanded && !full) setExpanded(false);
      else onClose();
    } else if (dy < -40 || v < -0.5) setExpanded(true);
  };

  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastFocus.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const tm = window.setTimeout(() => setMounted(false), reduce ? 0 : 420);
    lastFocus.current?.focus?.();
    return () => window.clearTimeout(tm);
  }, [open]);

  useEffect(() => {
    if (!shown) return;
    const el = panelRef.current;
    el?.querySelector<HTMLElement>("[data-autofocus], button, a[href]")?.focus({
      preventScroll: true,
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const f = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button, a[href], input, [tabindex]:not([tabindex='-1'])",
          ),
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [shown, onClose]);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="roam">
      <div className="r-scrim" data-open={shown} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="r-sheet"
        data-open={shown}
        data-full={full || expanded}
        data-dragging={dragY != null}
        style={dragY != null && shown ? { transform: `translateY(${dragY}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <NotchCard
          fill={fill}
          radius={34}
          shadow="drop-shadow(0 -6px 24px rgba(0,0,0,.18))"
          notches={[
            {
              edge: "top",
              cx: 0,
              center: true,
              width: 124,
              depth: 26,
              dock: <FrostButton icon="x" label={closeLabel} onClick={onClose} large />,
            },
          ]}
          className="r-sheet-head"
          style={{ height: 64, flex: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {headLeft ? (
            <div className="r-sheet-headleft" onPointerDown={(e) => e.stopPropagation()}>
              {headLeft}
            </div>
          ) : (
            <span />
          )}
        </NotchCard>
        <div
          className="r-sheet-scroll"
          style={{ background: fill, marginTop: -34, paddingTop: 34 }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
