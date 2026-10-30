// Organic notch card outline (Roam design system). Ported from the concept's
// lib.notch_path: a rounded rectangle whose top or bottom edge can carry
// concave scoops (depth > 0, a button docks into them) or convex bumps
// (depth < 0). Pure function so it is unit tested and SSR safe.

export type Notch = {
  edge: "top" | "bottom";
  /** Centre x in px from the left edge. Negative values count from the right edge. */
  cx: number;
  /** Total width of the scoop in px. */
  width: number;
  /** Depth in px. Positive scoops into the card, negative bumps out. */
  depth: number;
};

const f = (n: number) => (Math.round(n * 100) / 100).toString();

export function notchPath(w: number, h: number, r = 28, notches: Notch[] = []): string {
  if (w <= 0 || h <= 0) return "";
  const rr = Math.min(r, w / 2, h / 2);
  const abs = notches.map((n) => ({ ...n, cx: n.cx < 0 ? w + n.cx : n.cx }));
  const tops = abs.filter((n) => n.edge === "top").sort((a, b) => a.cx - b.cx);
  const bots = abs.filter((n) => n.edge === "bottom").sort((a, b) => b.cx - a.cx);
  const k45 = rr * 0.45;
  const p: string[] = [`M${f(rr)},0`];
  for (const { cx, width, depth: d } of tops) {
    const a = cx - width / 2;
    const b = cx + width / 2;
    const k = width * 0.2;
    p.push(
      `L${f(a)},0 C${f(a + k)},0 ${f(cx - k)},${f(d)} ${f(cx)},${f(d)} C${f(cx + k)},${f(d)} ${f(b - k)},0 ${f(b)},0`,
    );
  }
  p.push(
    `L${f(w - rr)},0 C${f(w - k45)},0 ${f(w)},${f(k45)} ${f(w)},${f(rr)} L${f(w)},${f(h - rr)} C${f(w)},${f(h - k45)} ${f(w - k45)},${f(h)} ${f(w - rr)},${f(h)}`,
  );
  for (const { cx, width, depth: d } of bots) {
    const a = cx + width / 2;
    const b = cx - width / 2;
    const k = width * 0.2;
    p.push(
      `L${f(a)},${f(h)} C${f(a - k)},${f(h)} ${f(cx + k)},${f(h - d)} ${f(cx)},${f(h - d)} C${f(cx - k)},${f(h - d)} ${f(b + k)},${f(h)} ${f(b)},${f(h)}`,
    );
  }
  p.push(
    `L${f(rr)},${f(h)} C${f(k45)},${f(h)} 0,${f(h - k45)} 0,${f(h - rr)} L0,${f(rr)} C0,${f(k45)} ${f(k45)},0 ${f(rr)},0 Z`,
  );
  return p.join(" ");
}
