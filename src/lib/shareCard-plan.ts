// Plan share card — mirrors the stop card, tuned for a pre-departure plan.

import { formatShareDay, formatShareDuration, formatShareTime } from "@aloya/core/share-card-copy";
import {
  drawCover,
  drawTracked,
  loadImg,
  measureTracked,
  roundRect,
  wrap,
} from "@/lib/canvas-draw";
import { C, pickPlanBg } from "@/lib/shareCard-theme";

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
  } catch {
    /* noop */
  }

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
    const x = 56,
      y = 56,
      padX = 22,
      padY = 14;
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
    parts.push(formatShareDay(c.departureUnix, c.locale));
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
    // The loop exits one step below the floor when nothing fits; clamp back so
    // the headline never renders smaller than the designed 48px minimum
    // (`wrap` already ellipsizes what still overflows at that size).
    size = Math.max(size, minSize);
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
      PAD,
      dividerY + 32,
      2.4,
    );
    ctx.fillStyle = C.ink;
    ctx.font = "600 56px 'JetBrains Mono', ui-monospace, monospace";
    const dep = formatShareTime(c.departureUnix, c.locale);
    const arr = formatShareTime(c.arrivalUnix, c.locale);
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
    sub.push(formatShareDuration(c.totalDurationSec, c.locale));
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
