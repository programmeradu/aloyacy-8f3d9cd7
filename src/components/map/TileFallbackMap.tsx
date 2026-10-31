// Map without WebGL (Oct 2026).
//
// Mapbox GL needs WebGL2. Browsers with no GPU, a blocked GPU or WebGL turned
// off (locked-down work PCs, some headless and remote desktops, older phones)
// throw "Failed to initialize WebGL" on every map, and retrying cannot help.
// MapPreview renders this instead: the same aerial tiles as plain images,
// routes and walks as SVG, stops, pins, live buses and the rider's dot laid
// over them, fitted to the same content. It pans by dragging. No token and
// no WebGL needed.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { decodePolyline } from "@aloya/core/shapes";
import { spanToZoom } from "@aloya/core/path-geometry";
import { markerStyle, GOOGLE_TO_MAPBOX_ZOOM } from "@/components/map/mapSymbols";
import type { DomPin } from "@/components/map/useDomPins";
import type { MapMarker, MapSegment } from "@/components/map/types";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const TILE = 256;
const MAX_TILE_Z = 19;
const MAX_FIT_ZOOM = 16; // same cap as the WebGL map's fitBounds
const FIT_PADDING = 40;

type LatLng = { lat: number; lng: number };
type Pad = { top: number; bottom: number; left: number; right: number };

/** Web Mercator at Mapbox's scale: the world is 512 * 2^z pixels wide. */
function worldPx(z: number) {
  return 512 * Math.pow(2, z);
}
function project(p: LatLng, z: number) {
  const w = worldPx(z);
  const s = Math.sin((Math.max(-85, Math.min(85, p.lat)) * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * w,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * w,
  };
}
function unproject(x: number, y: number, z: number): LatLng {
  const w = worldPx(z);
  const lng = (x / w) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / w;
  return { lng, lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) };
}

function toPad(p: number | Pad | undefined): Pad {
  if (p == null)
    return { top: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING, right: FIT_PADDING };
  if (typeof p === "number") return { top: p, bottom: p, left: p, right: p };
  return p;
}

export type FallbackVehicle = { id: string; lat: number; lng: number; bearing?: number };

type Props = {
  center: LatLng;
  spanKm: number;
  polyline?: string;
  segments?: MapSegment[];
  markers?: MapMarker[];
  fitPadding?: number | Pad;
  fitToContent?: boolean;
  pins?: DomPin[];
  declutterPx?: number;
  vehicles?: FallbackVehicle[];
  userLocation?: { lat: number; lng: number; headingDeg?: number | null } | null;
};

export function TileFallbackMap({
  center,
  spanKm,
  polyline,
  segments,
  markers,
  fitPadding,
  fitToContent,
  pins,
  declutterPx = 0,
  vehicles,
  userLocation,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const dragFrom = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const route = useMemo(() => (polyline ? decodePolyline(polyline) : []), [polyline]);
  const contentKey = `${polyline ?? ""}|${JSON.stringify(segments ?? null)}|${JSON.stringify(markers ?? null)}`;

  // Same rule as the WebGL map: fit to the content when there is any,
  // otherwise centre on `center` at the zoom implied by spanKm.
  const view = useMemo(() => {
    const pts: LatLng[] = [];
    for (const p of route) pts.push(p);
    for (const s of segments ?? []) for (const c of s.coords) pts.push(c);
    for (const m of markers ?? []) pts.push(m);
    const shouldFit = (fitToContent ?? pts.length > 0) && pts.length > 0;
    if (!shouldFit || !size.w || !size.h) {
      return { center, zoom: spanToZoom(spanKm) + GOOGLE_TO_MAPBOX_ZOOM };
    }
    const pad = toPad(fitPadding);
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const sw = { lat: Math.min(...lats), lng: Math.min(...lngs) };
    const ne = { lat: Math.max(...lats), lng: Math.max(...lngs) };
    const a = project(sw, 0);
    const b = project(ne, 0);
    const dx = Math.max(1e-9, Math.abs(b.x - a.x));
    const dy = Math.max(1e-9, Math.abs(b.y - a.y));
    const aw = Math.max(40, size.w - pad.left - pad.right);
    const ah = Math.max(40, size.h - pad.top - pad.bottom);
    const zoom = Math.min(MAX_FIT_ZOOM, Math.log2(aw / dx), Math.log2(ah / dy));
    // Centre the box inside the padded area.
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const k = Math.pow(2, zoom);
    const cx = mid.x * k - (pad.left - pad.right) / 2;
    const cy = mid.y * k - (pad.top - pad.bottom) / 2;
    return { center: unproject(cx, cy, zoom), zoom };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contentKey,
    size.w,
    size.h,
    center.lat,
    center.lng,
    spanKm,
    fitToContent,
    JSON.stringify(fitPadding ?? null),
  ]);

  // New content recentres the view.
  useEffect(() => setDrag({ x: 0, y: 0 }), [contentKey]);

  const z = view.zoom;
  const c = project(view.center, z);
  const originX = c.x - size.w / 2 - drag.x;
  const originY = c.y - size.h / 2 - drag.y;
  const pt = (p: LatLng) => {
    const q = project(p, z);
    return { x: q.x - originX, y: q.y - originY };
  };

  // Tiles: 256 px tiles one level up from Mapbox's 512 px zoom, scaled to fit.
  const tz = Math.max(0, Math.min(MAX_TILE_Z, Math.round(z + 1)));
  const ts = TILE * Math.pow(2, z + 1 - tz);
  const n = Math.pow(2, tz);
  const tiles: { key: string; src: string; left: number; top: number }[] = [];
  if (size.w && size.h) {
    const x0 = Math.floor(originX / ts);
    const y0 = Math.floor(originY / ts);
    const x1 = Math.floor((originX + size.w) / ts);
    const y1 = Math.floor((originY + size.h) / ts);
    for (let ty = Math.max(0, y0); ty <= Math.min(n - 1, y1); ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wx = ((tx % n) + n) % n;
        tiles.push({
          key: `${tz}/${tx}/${ty}`,
          src: `${ESRI}/${tz}/${ty}/${wx}`,
          left: tx * ts - originX,
          top: ty * ts - originY,
        });
      }
    }
  }

  const lineW = (base: number) =>
    Math.max(2, Math.min(base * 1.6, base * (0.45 + (z - 10) * 0.18)));
  const path = (coords: LatLng[]) =>
    coords
      .map((p, i) => {
        const q = pt(p);
        return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      })
      .join("");

  // Declutter pins the same way as the WebGL map: higher priority wins.
  const hidden = new Set<string>();
  if (declutterPx > 0 && pins) {
    const kept: { x: number; y: number }[] = [];
    for (const p of [...pins].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
      const q = pt(p);
      if (kept.some((k) => Math.abs(k.x - q.x) < declutterPx && Math.abs(k.y - q.y) < declutterPx))
        hidden.add(p.id);
      else kept.push(q);
    }
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragFrom.current = { px: e.clientX, py: e.clientY, x: drag.x, y: drag.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragFrom.current;
    if (!d) return;
    setDrag({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py });
  };
  const onUp = () => {
    dragFrom.current = null;
  };

  return (
    <div
      ref={hostRef}
      className="r-map-lite absolute inset-0 overflow-hidden bg-[#3b3d38]"
      style={{ touchAction: "pan-y", cursor: dragFrom.current ? "grabbing" : "grab" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      data-map-mode="lite"
    >
      <div
        className="absolute inset-0"
        style={{ filter: "saturate(0.7) brightness(0.8) contrast(1.06)" }}
        aria-hidden
      >
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.src}
            alt=""
            draggable={false}
            decoding="async"
            loading="eager"
            style={{
              position: "absolute",
              left: t.left,
              top: t.top,
              width: ts + 0.5,
              height: ts + 0.5,
              maxWidth: "none",
              userSelect: "none",
            }}
          />
        ))}
      </div>
      {size.w > 0 && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
          aria-hidden
        >
          {route.length > 1 && (
            <>
              <path
                d={path(route)}
                fill="none"
                stroke="#1f1f1c"
                strokeOpacity={0.35}
                strokeWidth={lineW(5) + 3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={path(route)}
                fill="none"
                stroke="#F6B83C"
                strokeWidth={lineW(5)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
          {(segments ?? []).map((s, i) =>
            s.kind === "walk" ? (
              <path
                key={`w${i}`}
                d={path(s.coords)}
                fill="none"
                stroke="#ffffff"
                strokeWidth={lineW(4)}
                strokeDasharray={`0.1 ${lineW(4) * 2}`}
                strokeLinecap="round"
              />
            ) : (
              <g key={`r${i}`}>
                <path
                  d={path(s.coords)}
                  fill="none"
                  stroke="#1f1f1c"
                  strokeOpacity={0.35}
                  strokeWidth={lineW(6.5) + 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={path(s.coords)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={lineW(6.5)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ),
          )}
          {(markers ?? []).map((m, i) => {
            if (m.kind === "bounds") return null;
            const st = markerStyle(m);
            const q = pt(m);
            const isStop = !m.kind || m.kind === "stop";
            if (isStop && polyline && z < 11) return null;
            return (
              <circle
                key={`m${i}`}
                cx={q.x}
                cy={q.y}
                r={st.radius}
                fill={st.color}
                stroke={st.stroke}
                strokeWidth={st.strokeWidth}
              />
            );
          })}
          {(vehicles ?? []).map((v) => {
            const q = pt(v);
            return (
              <g key={`v${v.id}`} transform={`translate(${q.x} ${q.y})`}>
                <circle r={9} fill="#F6B83C" stroke="#1f1f1c" strokeWidth={2} />
                <rect x={-3.5} y={-3} width={7} height={6} rx={1.5} fill="#1f1f1c" />
              </g>
            );
          })}
          {userLocation &&
            (() => {
              const q = pt(userLocation);
              return (
                <g transform={`translate(${q.x} ${q.y})`}>
                  <circle r={16} fill="#2f80ff" fillOpacity={0.2} />
                  <circle r={7} fill="#2f80ff" stroke="#ffffff" strokeWidth={3} />
                </g>
              );
            })()}
        </svg>
      )}
      {size.w > 0 &&
        (pins ?? []).map((p) => {
          const q = pt(p);
          return (
            <div
              key={p.id}
              className={hidden.has(p.id) ? "r-pin-hidden" : undefined}
              style={{
                position: "absolute",
                left: q.x,
                top: q.y,
                transform:
                  p.anchor === "bottom" ? "translate(-50%, -100%)" : "translate(-50%, -50%)",
                zIndex: 1 + (p.priority ?? 0),
              }}
            >
              {p.node}
            </div>
          );
        })}
    </div>
  );
}
