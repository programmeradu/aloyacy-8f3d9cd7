// Notched card: an SVG outline (notch.ts) sized to its content with a
// ResizeObserver, plus optional docked buttons centred in each scoop.
// Before the first measure (SSR, first paint) it falls back to a plain
// rounded box in the same fill so nothing jumps.
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { notchPath, type Notch } from "./notch";

const useIsoLayoutEffect = typeof window === "undefined" ? () => {} : useLayoutEffect;

export type DockedNotch = Notch & {
  dock?: ReactNode;
  /** Centre the notch horizontally (ignores cx). */ center?: boolean;
};

type Props = {
  children: ReactNode;
  notches?: DockedNotch[];
  fill?: string;
  radius?: number;
  shadow?: string;
  className?: string;
  style?: CSSProperties;
  /** Content rendered under the children and clipped to the outline (maps, textures). */
  underlay?: ReactNode;
  as?: "div" | "section" | "article";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  onPointerMove?: PointerEventHandler<HTMLElement>;
  onPointerUp?: PointerEventHandler<HTMLElement>;
  onPointerCancel?: PointerEventHandler<HTMLElement>;
};

export function NotchCard({
  children,
  notches = [],
  fill = "#fff",
  radius = 28,
  shadow = "drop-shadow(0 14px 28px rgba(0,0,0,.14))",
  className = "",
  style,
  underlay,
  as: Tag = "div",
  ...aria
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s && s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const resolved = size
    ? notches.map((n) => ({ ...n, cx: n.center ? size.w / 2 : n.cx < 0 ? size.w + n.cx : n.cx }))
    : [];
  const d = size ? notchPath(size.w, size.h, radius, resolved) : "";
  const clipId = useRef(`rn${Math.random().toString(36).slice(2, 9)}`).current;
  return (
    <Tag
      ref={ref as never}
      className={`r-notch ${className}`}
      style={{ ...style, ...(d ? null : { background: fill, borderRadius: radius }) }}
      {...aria}
    >
      {d ? (
        <svg
          className="r-notch-bg"
          width={size!.w}
          height={size!.h}
          aria-hidden="true"
          style={{ filter: shadow }}
        >
          <defs>
            <clipPath id={clipId}>
              <path d={d} />
            </clipPath>
          </defs>
          <path d={d} fill={fill} />
        </svg>
      ) : null}
      {underlay ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            clipPath: d ? `path('${d}')` : undefined,
            borderRadius: d ? undefined : radius,
            overflow: "hidden",
          }}
        >
          {underlay}
        </div>
      ) : null}
      <div className="r-notch-in">{children}</div>
      {size
        ? resolved.map((n, i) =>
            n.dock ? (
              <div
                key={i}
                className="r-notch-dock"
                style={{ left: n.cx, top: n.edge === "top" ? 0 : size.h }}
              >
                {n.dock}
              </div>
            ) : null,
          )
        : null}
    </Tag>
  );
}
