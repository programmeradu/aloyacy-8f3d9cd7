// Plan share sheet — mirrors ShareSheet but renders the bespoke plan card
// (destination hero, from → to, depart→arrive, duration, transfers, bus).
// Sends as an image via Web Share API so it lands as a real picture in
// WhatsApp / iMessage / anywhere, with the plan URL + text as fallback.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderPlanShareCard, type PlanCardCtx } from "@/lib/shareCard";
import {
  IconClose,
  IconDownload,
  IconLink,
  IconShare,
  IconWhatsApp,
} from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  ctx: PlanCardCtx;
};

export function PlanShareSheet({ open, onClose, ctx }: Props) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const renderedFor = useRef<string>("");

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 2600);
  }

  function fileName(): string {
    const dest = ctx.destinationLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "plan";
    return `aloya-plan-${dest}.jpg`;
  }
  function makeFile(): File | null {
    if (!blob) return null;
    return new File([blob], fileName(), { type: "image/jpeg" });
  }
  function canShareFile(file: File): boolean {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    return !!nav.canShare && nav.canShare({ files: [file] });
  }

  useEffect(() => {
    if (!open) return;
    const key = JSON.stringify({
      d: ctx.destinationLabel,
      o: ctx.originLabel,
      dep: ctx.departureUnix,
      arr: ctx.arrivalUnix,
      tr: ctx.transfers,
      r: ctx.routeShort,
      l: ctx.locale,
      u: ctx.url,
    });
    if (renderedFor.current === key) return;
    renderedFor.current = key;
    let cancelled = false;
    setBusy(true);
    renderPlanShareCard(ctx)
      .then((r) => {
        if (cancelled) return;
        setBlob(r.blob);
        setPreview(r.dataUrl);
      })
      .catch(() => { /* preview just won't appear */ })
      .finally(() => !cancelled && setBusy(false));
    return () => { cancelled = true; };
  }, [open, ctx]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const shareText = buildText(ctx);

  async function handleNativeShare() {
    const file = makeFile();
    if (!file) return;
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: t("share.plan.title"), text: shareText, url: ctx.url });
        return;
      } catch { return; }
    }
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ text: shareText, url: ctx.url })) {
      try { await navigator.share({ text: shareText, url: ctx.url }); return; } catch { return; }
    }
    triggerDownload(file);
  }

  async function handleWhatsApp() {
    const file = makeFile();
    if (!file) return;
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: t("share.plan.title"), text: shareText, url: ctx.url });
        return;
      } catch { return; }
    }
    triggerDownload(file);
    try { await navigator.clipboard.writeText(`${shareText}\n${ctx.url}`); } catch { /* noop */ }
    const wa = `https://web.whatsapp.com/send?text=${encodeURIComponent(shareText + "\n" + ctx.url)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
    flash(t("share.waFallback"));
  }

  async function handleSave() {
    const file = makeFile();
    if (!file) return;
    if (canShareFile(file) && isLikelyMobile()) {
      try {
        await navigator.share({ files: [file], title: t("share.plan.title") });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    triggerDownload(file);
    flash(t("share.saved"));
  }

  function triggerDownload(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(ctx.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* noop */ }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("share.plan.title")}
    >
      <button
        type="button"
        aria-label={t("share.close")}
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-md animate-fade-in"
      />
      <div className="relative w-full sm:max-w-[440px] bg-card sm:rounded-3xl rounded-t-3xl ring-1 ring-line shadow-2xl overflow-hidden animate-rise">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
              {t("share.eyebrow")}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 -mr-1 flex items-center justify-center rounded-full text-ink-soft hover:bg-limestone-soft"
            aria-label={t("share.close")}
          >
            <IconClose className="size-4" />
          </button>
        </div>

        <div className="px-5 pb-3">
          <h2 className="font-display text-[22px] leading-tight text-ink">
            {t("share.plan.title")}
          </h2>
          <p className="mt-1 text-[12px] text-ink-soft">
            {t("share.subtitle")}
          </p>
        </div>

        <div className="px-5">
          <div
            className="relative w-full overflow-hidden rounded-2xl ring-1 ring-line bg-limestone-soft"
            style={{ aspectRatio: "1080 / 1350" }}
          >
            {preview ? (
              <img
                src={preview}
                alt={t("share.previewAlt")}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
                  {busy ? t("share.rendering") : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pt-4 pb-6 grid grid-cols-2 gap-2.5">
          <ActionButton primary onClick={handleNativeShare} icon={<IconShare className="size-4" />} label={t("share.share")} disabled={!blob} />
          <ActionButton onClick={handleWhatsApp} icon={<IconWhatsApp className="size-[18px] text-[#25D366]" />} label={t("share.whatsapp")} disabled={!blob} />
          <ActionButton onClick={handleSave} icon={<IconDownload className="size-4" />} label={t("share.save")} disabled={!blob} />
          <ActionButton onClick={handleCopy} icon={<IconLink className="size-4" />} label={copied ? t("share.copied") : t("share.copyLink")} />
        </div>

        {notice ? (
          <div
            role="status"
            aria-live="polite"
            className="mx-5 mb-5 -mt-2 rounded-xl bg-limestone-soft ring-1 ring-line px-3 py-2 text-[12px] text-ink-soft text-center animate-fade-in"
          >
            {notice}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function ActionButton({
  onClick, icon, label, primary, disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "flex items-center justify-center gap-2 h-12 rounded-2xl text-[13px] font-medium transition-colors ring-1 disabled:opacity-50 disabled:cursor-not-allowed " +
        (primary
          ? "bg-ink text-limestone ring-ink hover:bg-ink-soft"
          : "bg-card text-ink ring-line hover:bg-limestone-soft")
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function fmtHM(unix: number, locale: "en" | "el"): string {
  return new Date(unix * 1000).toLocaleTimeString(locale === "el" ? "el-GR" : "en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Nicosia",
  });
}

function buildText(ctx: PlanCardCtx): string {
  const el = ctx.locale === "el";
  const lines: string[] = [];
  lines.push(el ? `Πλάνο για ${ctx.destinationLabel}` : `Plan to ${ctx.destinationLabel}`);
  lines.push(
    el
      ? `Από ${ctx.originLabel}`
      : `From ${ctx.originLabel}`,
  );
  const dep = fmtHM(ctx.departureUnix, ctx.locale);
  const arr = fmtHM(ctx.arrivalUnix, ctx.locale);
  lines.push(el ? `Αναχώρηση ${dep} — Άφιξη ${arr}` : `Depart ${dep} — Arrive ${arr}`);
  if (ctx.routeShort) {
    lines.push(el ? `Λεωφορείο ${ctx.routeShort}` : `Bus ${ctx.routeShort}`);
  }
  lines.push(el ? "Άνοιξέ το στο Aloya" : "Open it in Aloya");
  return lines.join("\n");
}
