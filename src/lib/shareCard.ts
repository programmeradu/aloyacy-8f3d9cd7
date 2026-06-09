// Apple-grade share card renderer for Aloya.
// Produces a 1080×1350 PNG composed of a bespoke Cyprus-context background
// + editorial typography. Returns a Blob suitable for navigator.share({ files })
// and a data URL for in-app preview.
//
// Background pick is deterministic per stop (so the same stop always renders
// the same beautiful image), biased by name/agency keywords and time of day.

import oldtown from "@/assets/share/share-oldtown.jpg";
import coastDusk from "@/assets/share/share-coast-dusk.jpg";
import mountain from "@/assets/share/share-mountain.jpg";
import coastRoad from "@/assets/share/share-coastroad.jpg";
import harborNight from "@/assets/share/share-harbor-night.jpg";
import urbanMorning from "@/assets/share/share-urban-morning.jpg";

// Hex equivalents of the brand oklch tokens — kept inline because canvas
// can't read CSS custom properties reliably across all browsers.
const C = {
  limestone: "#FAF6EE",
  limestoneSoft: "#F2EBD9",
  aegean: "#5FA3B3",
  aegeanSoft: "#DDE9EB",
  aegeanDeep: "#2F6E80",
  ochre: "#C28C44",
  ochreSoft: "#F0DDB6",
  olive: "#4A5240",
  oliveSoft: "#7A826F",
  ink: "#1E221C",
  inkSoft: "#4B4F45",
};

type Bg = { src: string; mood: "warm" | "cool" | "neutral" };

const BG: Record<string, Bg> = {
  oldtown: { src: oldtown, mood: "warm" },
  coastDusk: { src: coastDusk, mood: "cool" },
  mountain: { src: mountain, mood: "neutral" },
  coastRoad: { src: coastRoad, mood: "warm" },
  harborNight: { src: harborNight, mood: "cool" },
  urbanMorning: { src: urbanMorning, mood: "neutral" },
};

// Simple FNV-1a — stable, no dependencies.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickBg(stop: { id: string; name: string; agency: string }): Bg {
  const n = stop.name.toLowerCase();
  // Keyword bias first — context wins over randomness.
  if (/(troodos|kakopetria|platres|pano |kalopanay|pedoulas|prodromos|omodos)/.test(n))
    return BG.mountain;
  if (/(phinikoud|finikoud|larnaca seafront|seafront|promenade|marina)/.test(n))
    return BG.coastDusk;
  if (/(pafos|paphos|harbor|harbour|kato pafos|kato paphos|coral bay)/.test(n))
    return BG.harborNight;
  if (/(limassol|lemesos|protaras|ayia napa|agia napa|paralimni|coral|coast|beach|akamas|polis)/.test(n))
    return BG.coastRoad;
  if (/(faneromen|ledra|laiki geitonia|old town|chrysaliniotissa|tahtakala)/.test(n))
    return BG.oldtown;
  if (stop.agency === "IC") return BG.coastRoad;
  // Default: deterministic pick across urban/oldtown options.
  const order = [BG.urbanMorning, BG.oldtown, BG.urbanMorning, BG.oldtown];
  return order[hash(stop.id) % order.length];
}

// Preload an image as HTMLImageElement.
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Cover-fit draw with focal point biased to top-center.
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  focal = 0.4, // 0 = top, 1 = bottom
) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;
  if (ir > tr) {
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / tr;
    sy = (img.height - sh) * focal;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Wrap text to fit width, return lines (max `maxLines`, ellipsizing last).
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (ctx.measureText(next).width <= maxW) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // Ellipsize last if overflow.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    const ell = "…";
    if (ctx.measureText(last).width > maxW) {
      while (last.length > 1 && ctx.measureText(last + ell).width > maxW) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last.trimEnd() + ell;
    }
  }
  return lines;
}

export type StopCardCtx = {
  stop: { id: string; code: string; name: string; agency: string };
  routes: { short: string }[];
  nextEtaMin: number | null;
  nextHeadsign: string | null;
  locale: "en" | "el";
  url: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────────

export async function renderStopShareCard(c: StopCardCtx): Promise<{
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  // Crisp text on high-DPI export.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Ensure brand fonts are ready before drawing.
  try {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
      ?.ready;
  } catch {
    /* noop */
  }

  // Background fill (limestone) — fallback if image fails.
  ctx.fillStyle = C.limestone;
  ctx.fillRect(0, 0, W, H);

  const bg = pickBg(c.stop);
  const img = await loadImg(bg.src).catch(() => null);

  // ─── Hero image band (0..760) ──────────────────────────────────────────────
  const HERO_H = 760;
  if (img) {
    drawCover(ctx, img, 0, 0, W, HERO_H, 0.35);
  } else {
    ctx.fillStyle = bg.mood === "cool" ? C.aegeanDeep : C.ochre;
    ctx.fillRect(0, 0, W, HERO_H);
  }

  // Subtle vignette + bottom fade into limestone.
  const fade = ctx.createLinearGradient(0, HERO_H - 240, 0, HERO_H);
  fade.addColorStop(0, "rgba(250,246,238,0)");
  fade.addColorStop(1, C.limestone);
  ctx.fillStyle = fade;
  ctx.fillRect(0, HERO_H - 240, W, 240);

  // Soft top-down vignette to lift the wordmark off bright skies.
  const topShade = ctx.createLinearGradient(0, 0, 0, 260);
  topShade.addColorStop(0, "rgba(20,24,18,0.30)");
  topShade.addColorStop(1, "rgba(20,24,18,0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, W, 260);

  // ─── Top chip: ALOYA wordmark ──────────────────────────────────────────────
  {
    const x = 56;
    const y = 56;
    const padX = 22;
    const padY = 14;
    ctx.font =
      "700 26px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
    const labelW = ctx.measureText("Aloya").width;
    ctx.font =
      "500 14px 'JetBrains Mono', ui-monospace, monospace";
    const subW = measureTracked(ctx, "CYPRUS TRANSIT", 2.4);
    const chipW = padX * 2 + labelW + 22 + subW + 14;
    const chipH = 56;
    ctx.fillStyle = "rgba(250,246,238,0.94)";
    roundRect(ctx, x, y, chipW, chipH, chipH / 2);
    ctx.fill();
    // Wordmark
    ctx.fillStyle = C.ink;
    ctx.font =
      "700 26px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Aloya", x + padX, y + padY + 24);
    // Divider dash (no bullets per brand)
    ctx.strokeStyle = C.inkSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const divX = x + padX + labelW + 10;
    ctx.moveTo(divX, y + 18);
    ctx.lineTo(divX, y + chipH - 18);
    ctx.stroke();
    ctx.fillStyle = C.inkSoft;
    ctx.font = "500 14px 'JetBrains Mono', ui-monospace, monospace";
    // Letter-spacing: emulate tracking by drawing per-char
    drawTracked(
      ctx,
      "CYPRUS TRANSIT",
      x + padX + labelW + 20,
      y + padY + 22,
      2.4,
    );
  }

  // ─── Top-right context tag ─────────────────────────────────────────────────
  {
    const tag =
      c.stop.agency === "IC"
        ? c.locale === "el"
          ? "ΥΠΕΡΑΣΤΙΚΟ"
          : "INTERCITY"
        : c.locale === "el"
          ? "ΑΣΤΙΚΟ"
          : "URBAN";
    ctx.font = "500 14px 'JetBrains Mono', ui-monospace, monospace";
    const tagW = measureTracked(ctx, tag, 2.4);
    const pad = 20;
    const chipW = tagW + pad * 2;
    const chipH = 44;
    const x = W - 56 - chipW;
    const y = 62;
    ctx.fillStyle = "rgba(30,34,28,0.55)";
    roundRect(ctx, x, y, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.fillStyle = C.limestone;
    drawTracked(ctx, tag, x + pad, y + 28, 2.4);
  }

  // ─── Bottom panel content (limestone) ──────────────────────────────────────
  const PAD = 60;
  const innerW = W - PAD * 2;

  // Eyebrow — "BUS STOP · {code} — LIVE"
  {
    const eyebrow =
      (c.locale === "el" ? "ΣΤΑΣΗ" : "BUS STOP") +
      "   " +
      c.stop.code +
      "   " +
      (c.locale === "el" ? "ΖΩΝΤΑΝΑ" : "LIVE");
    ctx.fillStyle = C.inkSoft;
    ctx.font = "600 16px 'JetBrains Mono', ui-monospace, monospace";
    drawTracked(ctx, eyebrow, PAD, 820, 2.8);
    // tiny live dot
    ctx.fillStyle = C.aegeanDeep;
    ctx.beginPath();
    ctx.arc(PAD + measureTracked(ctx, eyebrow, 2.8) + 12, 814, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stop name — display, up to 2 lines, auto-shrink to fit.
  let nameBottomY = 870;
  {
    let size = 80;
    const minSize = 48;
    ctx.fillStyle = C.ink;
    let lines: string[] = [];
    while (size >= minSize) {
      ctx.font = `600 ${size}px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif`;
      lines = wrap(ctx, c.stop.name, innerW, 2);
      const longest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (longest <= innerW && lines.length <= 2) break;
      size -= 4;
    }
    const lh = size * 1.02;
    const startY = 870;
    ctx.font = `600 ${size}px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif`;
    lines.forEach((line, i) => {
      ctx.fillText(line, PAD, startY + i * lh + size * 0.82);
    });
    nameBottomY = startY + (lines.length - 1) * lh + size * 0.82;
  }

  // Route chips — placed relative to the name bottom so 1- and 2-line stops
  // both breathe properly.
  const chipH = 52;
  const chipY = Math.min(1080, nameBottomY + 34);
  {
    const gap = 12;
    const maxChips = 6;
    const shown = c.routes.slice(0, maxChips);
    const extra = Math.max(0, c.routes.length - shown.length);
    let x = PAD;
    ctx.font = "600 22px 'JetBrains Mono', ui-monospace, monospace";
    for (const r of shown) {
      const labelW = ctx.measureText(r.short).width;
      const w = Math.max(chipH, labelW + 30);
      if (x + w > W - PAD) break;
      ctx.fillStyle = C.aegeanSoft;
      roundRect(ctx, x, chipY, w, chipH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(47,110,128,0.18)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = C.aegeanDeep;
      ctx.font = "600 22px 'JetBrains Mono', ui-monospace, monospace";
      ctx.fillText(r.short, x + (w - labelW) / 2, chipY + chipH / 2 + 8);
      x += w + gap;
    }
    if (extra > 0 && x + 76 <= W - PAD) {
      const label = `+${extra}`;
      const w = 76;
      roundRect(ctx, x, chipY, w, chipH, 14);
      ctx.strokeStyle = "rgba(75,79,69,0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = C.inkSoft;
      ctx.font = "600 22px 'JetBrains Mono', ui-monospace, monospace";
      const lw = ctx.measureText(label).width;
      ctx.fillText(label, x + (w - lw) / 2, chipY + chipH / 2 + 8);
    }
  }

  // Next bus block — divider + label + giant numeral + headsign
  const dividerY = Math.max(1150, chipY + chipH + 38);
  {
    ctx.strokeStyle = "rgba(75,79,69,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, dividerY);
    ctx.lineTo(W - PAD, dividerY);
    ctx.stroke();

    // Layout: ETA on the right at fixed width, headsign fills the rest.
    const etaMin = c.nextEtaMin;
    const big = etaMin != null ? String(etaMin) : "—";
    ctx.font = "600 110px 'JetBrains Mono', ui-monospace, monospace";
    const bigW = ctx.measureText(big).width;
    const unit = c.locale === "el" ? "λεπτά" : "min";
    ctx.font =
      "600 26px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
    const unitW = etaMin != null ? ctx.measureText(unit).width : 0;
    const etaTotalW = bigW + (etaMin != null ? 12 + unitW : 0);
    const etaXRight = W - PAD - etaTotalW;
    const leftMaxW = etaXRight - PAD - 28;

    // Left: NEXT BUS label
    ctx.fillStyle = C.inkSoft;
    ctx.font = "600 14px 'JetBrains Mono', ui-monospace, monospace";
    drawTracked(
      ctx,
      c.locale === "el" ? "ΕΠΟΜΕΝΟ ΛΕΩΦΟΡΕΙΟ" : "NEXT BUS",
      PAD,
      dividerY + 32,
      2.4,
    );

    // Headsign (strip leading arrow if present from upstream)
    const cleanHs = c.nextHeadsign
      ? c.nextHeadsign.replace(/^[→➜➡⇒\s]+/, "").trim()
      : null;
    if (cleanHs) {
      ctx.fillStyle = C.ink;
      ctx.font =
        "600 24px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
      const hs = wrap(ctx, cleanHs, Math.max(220, leftMaxW), 2);
      hs.forEach((line, i) => {
        ctx.fillText(line, PAD, dividerY + 72 + i * 30);
      });
    }

    // Giant ETA on the right — baseline pulled up so descenders clear footer.
    const etaBaseline = dividerY + 108;
    ctx.fillStyle = etaMin != null ? C.ink : C.inkSoft;
    ctx.font = "600 110px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillText(big, etaXRight, etaBaseline);
    if (etaMin != null) {
      ctx.fillStyle = C.inkSoft;
      ctx.font =
        "600 26px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(unit, etaXRight + bigW + 12, etaBaseline);
    }
  }



  // Footer — URL + open mark
  {
    const y = 1300;
    ctx.strokeStyle = "rgba(75,79,69,0.18)";
    ctx.beginPath();
    ctx.moveTo(PAD, y - 30);
    ctx.lineTo(W - PAD, y - 30);
    ctx.stroke();

    ctx.fillStyle = C.inkSoft;
    ctx.font = "500 18px 'JetBrains Mono', ui-monospace, monospace";
    const url = c.url.replace(/^https?:\/\//, "");
    ctx.fillText(url, PAD, y);

    const cta = c.locale === "el" ? "ΑΝΟΙΓΜΑ ΣΤΟ ALOYA  →" : "OPEN IN ALOYA  →";
    ctx.font = "600 16px 'JetBrains Mono', ui-monospace, monospace";
    const ctaW = measureTracked(ctx, cta, 2.6);
    ctx.fillStyle = C.aegeanDeep;
    drawTracked(ctx, cta, W - PAD - ctaW, y, 2.6);
  }

  // Export
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92),
  );
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { blob, dataUrl, width: W, height: H };
}

// ─── Tracked-text helpers (per-char fill — canvas has no letter-spacing) ─────
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}
function measureTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  spacing: number,
): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan share card — mirrors the stop card, tuned for a pre-departure plan
// ─────────────────────────────────────────────────────────────────────────────

export type PlanCardCtx = {
  originLabel: string;
  destinationLabel: string;
  departureUnix: number;
  arrivalUnix: number;
  totalDurationSec: number;
  transfers: number;
  routeShort: string | null;
  creatorName: string | null;
  locale: "en" | "el";
  url: string;
};

function pickPlanBg(destination: string): Bg {
  const n = destination.toLowerCase();
  if (/(troodos|kakopetria|platres|kalopanay|pedoulas|prodromos|omodos)/.test(n))
    return BG.mountain;
  if (/(phinikoud|finikoud|seafront|promenade|marina|larnaca)/.test(n))
    return BG.coastDusk;
  if (/(pafos|paphos|harbor|harbour|coral bay)/.test(n)) return BG.harborNight;
  if (/(limassol|lemesos|protaras|ayia napa|agia napa|paralimni|coast|beach|akamas|polis)/.test(n))
    return BG.coastRoad;
  if (/(nicosia|lefkosia|ledra|faneromen|old town)/.test(n)) return BG.oldtown;
  const order = [BG.coastRoad, BG.oldtown, BG.urbanMorning, BG.coastDusk];
  return order[hash(destination) % order.length];
}

function fmtHM(unix: number, locale: "en" | "el"): string {
  return new Date(unix * 1000).toLocaleTimeString(locale === "el" ? "el-GR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Nicosia",
  });
}
function fmtDay(unix: number, locale: "en" | "el"): string {
  return new Date(unix * 1000)
    .toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Nicosia",
    })
    .toUpperCase();
}
function fmtDur(sec: number, locale: "en" | "el"): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return locale === "el" ? `${m} λεπτά` : `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hLbl = locale === "el" ? "ώ" : "h";
  const mLbl = locale === "el" ? "λ" : "m";
  return r ? `${h}${hLbl} ${r}${mLbl}` : `${h}${hLbl}`;
}

export async function renderPlanShareCard(c: PlanCardCtx): Promise<{
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  try {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  } catch { /* noop */ }

  ctx.fillStyle = C.limestone;
  ctx.fillRect(0, 0, W, H);

  const bg = pickPlanBg(c.destinationLabel);
  const img = await loadImg(bg.src).catch(() => null);

  const HERO_H = 760;
  if (img) {
    drawCover(ctx, img, 0, 0, W, HERO_H, 0.35);
  } else {
    ctx.fillStyle = bg.mood === "cool" ? C.aegeanDeep : C.ochre;
    ctx.fillRect(0, 0, W, HERO_H);
  }

  const fade = ctx.createLinearGradient(0, HERO_H - 240, 0, HERO_H);
  fade.addColorStop(0, "rgba(250,246,238,0)");
  fade.addColorStop(1, C.limestone);
  ctx.fillStyle = fade;
  ctx.fillRect(0, HERO_H - 240, W, 240);

  const topShade = ctx.createLinearGradient(0, 0, 0, 260);
  topShade.addColorStop(0, "rgba(20,24,18,0.30)");
  topShade.addColorStop(1, "rgba(20,24,18,0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, W, 260);

  // Wordmark chip (top-left)
  {
    const x = 56, y = 56, padX = 22, padY = 14;
    ctx.font = "700 26px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
    const labelW = ctx.measureText("Aloya").width;
    ctx.font = "500 14px 'JetBrains Mono', ui-monospace, monospace";
    const subW = measureTracked(ctx, "CYPRUS TRANSIT", 2.4);
    const chipW = padX * 2 + labelW + 22 + subW + 14;
    const chipH = 56;
    ctx.fillStyle = "rgba(250,246,238,0.94)";
    roundRect(ctx, x, y, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = "700 26px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Aloya", x + padX, y + padY + 24);
    ctx.strokeStyle = C.inkSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const divX = x + padX + labelW + 10;
    ctx.moveTo(divX, y + 18);
    ctx.lineTo(divX, y + chipH - 18);
    ctx.stroke();
    ctx.fillStyle = C.inkSoft;
    ctx.font = "500 14px 'JetBrains Mono', ui-monospace, monospace";
    drawTracked(ctx, "CYPRUS TRANSIT", x + padX + labelW + 20, y + padY + 22, 2.4);
  }

  // "PLAN" tag (top-right)
  {
    const tag = c.locale === "el" ? "ΠΛΑΝΟ" : "PLAN";
    ctx.font = "500 14px 'JetBrains Mono', ui-monospace, monospace";
    const tagW = measureTracked(ctx, tag, 2.4);
    const pad = 20;
    const chipW = tagW + pad * 2;
    const chipH = 44;
    const x = W - 56 - chipW;
    const y = 62;
    ctx.fillStyle = "rgba(30,34,28,0.55)";
    roundRect(ctx, x, y, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.fillStyle = C.limestone;
    drawTracked(ctx, tag, x + pad, y + 28, 2.4);
  }

  const PAD = 60;
  const innerW = W - PAD * 2;

  // Eyebrow: "PLAN · <day> · SHARED BY <name>"
  {
    const parts: string[] = [];
    parts.push(fmtDay(c.departureUnix, c.locale));
    if (c.creatorName) {
      parts.push((c.locale === "el" ? "ΑΠΟ " : "BY ") + c.creatorName.toUpperCase());
    }
    const eyebrow = parts.join("   ");
    ctx.fillStyle = C.inkSoft;
    ctx.font = "600 16px 'JetBrains Mono', ui-monospace, monospace";
    drawTracked(ctx, eyebrow, PAD, 820, 2.8);
  }

  // Destination headline (up to 2 lines, auto-shrink)
  let nameBottomY = 870;
  {
    let size = 80;
    const minSize = 48;
    ctx.fillStyle = C.ink;
    let lines: string[] = [];
    while (size >= minSize) {
      ctx.font = `600 ${size}px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif`;
      lines = wrap(ctx, c.destinationLabel, innerW, 2);
      const longest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (longest <= innerW && lines.length <= 2) break;
      size -= 4;
    }
    const lh = size * 1.02;
    const startY = 870;
    ctx.font = `600 ${size}px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif`;
    lines.forEach((line, i) => {
      ctx.fillText(line, PAD, startY + i * lh + size * 0.82);
    });
    nameBottomY = startY + (lines.length - 1) * lh + size * 0.82;
  }

  // "From <origin>" subline
  {
    const y = Math.min(1080, nameBottomY + 34);
    ctx.fillStyle = C.inkSoft;
    ctx.font = "500 24px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
    const prefix = c.locale === "el" ? "από " : "from ";
    const line = prefix + c.originLabel;
    const lines = wrap(ctx, line, innerW, 1);
    ctx.fillText(lines[0], PAD, y);
  }

  // Divider + facts row: DEP → ARR • duration • transfers • bus chip
  const dividerY = Math.max(1150, nameBottomY + 100);
  {
    ctx.strokeStyle = "rgba(75,79,69,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, dividerY);
    ctx.lineTo(W - PAD, dividerY);
    ctx.stroke();

    // Left: label + times
    ctx.fillStyle = C.inkSoft;
    ctx.font = "600 14px 'JetBrains Mono', ui-monospace, monospace";
    drawTracked(
      ctx,
      c.locale === "el" ? "ΑΝΑΧΩΡΗΣΗ → ΑΦΙΞΗ" : "DEPART → ARRIVE",
      PAD, dividerY + 32, 2.4,
    );
    ctx.fillStyle = C.ink;
    ctx.font = "600 56px 'JetBrains Mono', ui-monospace, monospace";
    const dep = fmtHM(c.departureUnix, c.locale);
    const arr = fmtHM(c.arrivalUnix, c.locale);
    ctx.fillText(dep, PAD, dividerY + 92);
    const depW = ctx.measureText(dep).width;
    ctx.fillStyle = C.inkSoft;
    ctx.font = "500 36px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("→", PAD + depW + 18, dividerY + 88);
    const arrowW = ctx.measureText("→").width;
    ctx.fillStyle = C.ink;
    ctx.font = "600 56px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillText(arr, PAD + depW + 18 + arrowW + 18, dividerY + 92);

    // Duration + transfers, below times
    const sub: string[] = [];
    sub.push(fmtDur(c.totalDurationSec, c.locale));
    if (c.transfers > 0) {
      sub.push(
        c.locale === "el"
          ? `${c.transfers} μεταφορά${c.transfers === 1 ? "" : "ς"}`
          : `${c.transfers} transfer${c.transfers === 1 ? "" : "s"}`,
      );
    } else {
      sub.push(c.locale === "el" ? "χωρίς μεταφορά" : "direct");
    }
    ctx.fillStyle = C.inkSoft;
    ctx.font = "500 22px 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(sub.join("   ·   "), PAD, dividerY + 140);

    // Right: bus chip
    if (c.routeShort) {
      ctx.font = "600 44px 'JetBrains Mono', ui-monospace, monospace";
      const rw = ctx.measureText(c.routeShort).width;
      const chipW = Math.max(150, rw + 60);
      const chipH = 110;
      const x = W - PAD - chipW;
      const y = dividerY + 34;
      ctx.fillStyle = C.aegeanDeep;
      roundRect(ctx, x, y, chipW, chipH, 22);
      ctx.fill();
      ctx.fillStyle = "rgba(250,246,238,0.75)";
      ctx.font = "600 13px 'JetBrains Mono', ui-monospace, monospace";
      drawTracked(ctx, c.locale === "el" ? "ΛΕΩΦΟΡΕΙΟ" : "BUS", x + 18, y + 28, 2.4);
      ctx.fillStyle = C.limestone;
      ctx.font = "600 44px 'JetBrains Mono', ui-monospace, monospace";
      ctx.fillText(c.routeShort, x + (chipW - rw) / 2, y + chipH - 22);
    }
  }

  // Footer
  {
    const y = 1300;
    ctx.strokeStyle = "rgba(75,79,69,0.18)";
    ctx.beginPath();
    ctx.moveTo(PAD, y - 30);
    ctx.lineTo(W - PAD, y - 30);
    ctx.stroke();

    ctx.fillStyle = C.inkSoft;
    ctx.font = "500 18px 'JetBrains Mono', ui-monospace, monospace";
    const url = c.url.replace(/^https?:\/\//, "");
    ctx.fillText(url, PAD, y);

    const cta = c.locale === "el" ? "ΑΝΟΙΓΜΑ ΣΤΟ ALOYA  →" : "OPEN IN ALOYA  →";
    ctx.font = "600 16px 'JetBrains Mono', ui-monospace, monospace";
    const ctaW = measureTracked(ctx, cta, 2.6);
    ctx.fillStyle = C.aegeanDeep;
    drawTracked(ctx, cta, W - PAD - ctaW, y, 2.6);
  }

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92),
  );
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { blob, dataUrl, width: W, height: H };
}
