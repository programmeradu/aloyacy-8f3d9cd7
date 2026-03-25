// Apple-grade share sheet for Aloya. Renders a bespoke Cyprus-context share
// card on canvas, previews it in a modal, and offers four actions:
//   • Share (Web Share API with file — lands as the IMAGE in WhatsApp/iMessage)
//   • WhatsApp (deep-link with rich text fallback when file share isn't supported)
//   • Save image (download the PNG)
//   • Copy link (plain URL)
//
// The card itself is the share asset — we don't rely on the receiver's app
// scraping OG meta, so the experience is consistent across every platform.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderStopShareCard, type StopCardCtx } from "@/lib/shareCard";
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
  ctx: StopCardCtx;
};

export function ShareSheet({ open, onClose, ctx }: Props) {
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

  function makeFile(): File | null {
    if (!blob) return null;
    return new File([blob], `aloya-${ctx.stop.code}.jpg`, { type: "image/jpeg" });
  }

  function canShareFile(file: File): boolean {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    return !!nav.canShare && nav.canShare({ files: [file] });
  }

  // Render the card when the sheet opens (or context meaningfully changes).
  useEffect(() => {
    if (!open) return;
    const key = JSON.stringify({
      id: ctx.stop.id,
      eta: ctx.nextEtaMin,
      hs: ctx.nextHeadsign,
      r: ctx.routes.map((r) => r.short).join(","),
      l: ctx.locale,
    });
    if (renderedFor.current === key) return;
    renderedFor.current = key;
    let cancelled = false;
    setBusy(true);
    renderStopShareCard(ctx)
      .then((r) => {
        if (cancelled) return;
        setBlob(r.blob);
        setPreview(r.dataUrl);
      })
      .catch(() => {
        /* swallow — preview just won't appear */
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [open, ctx]);

  // Escape to close.
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

  const shareText = buildShareText(ctx);

  async function handleNativeShare() {
    const file = makeFile();
    if (!file) return;
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: ctx.stop.name, text: shareText, url: ctx.url });
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
    // Preferred path: native share sheet with image — user picks WhatsApp
    // and the card lands as a real picture, not just a link preview.
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: ctx.stop.name, text: shareText, url: ctx.url });
        return;
      } catch { return; }
    }
    // Fallback (desktop / unsupported): save the image locally, copy text to
    // clipboard, then open WhatsApp Web so the user can paste + attach.
    triggerDownload(file);
    try { await navigator.clipboard.writeText(`${shareText}\n${ctx.url}`); } catch { /* noop */ }
    const wa = `https://web.whatsapp.com/send?text=${encodeURIComponent(shareText + "\n" + ctx.url)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
    flash(t("share.waFallback"));
  }

  async function handleSave() {
    const file = makeFile();
    if (!file) return;
    // On mobile the OS share sheet exposes "Save Image" / "Save to Photos",
    // which is the closest thing the web has to a Gallery permission prompt.
    // Prefer it when available; otherwise fall back to a regular download.
    if (canShareFile(file) && isLikelyMobile()) {
      try {
        await navigator.share({ files: [file], title: ctx.stop.name });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
        // fall through to download
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
    } catch {
      /* noop */
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("share.title")}
    >
      <button
        type="button"
        aria-label={t("share.close")}
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-md animate-fade-in"
      />
      <div className="relative w-full sm:max-w-[440px] bg-card sm:rounded-3xl rounded-t-3xl ring-1 ring-line shadow-2xl overflow-hidden animate-rise">
        {/* Handle / header */}
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
            {t("share.title")}
          </h2>
          <p className="mt-1 text-[12px] text-ink-soft">
            {t("share.subtitle")}
          </p>
        </div>

        {/* Preview */}
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

        {/* Actions */}
        <div className="px-5 pt-4 pb-6 grid grid-cols-2 gap-2.5">
          <ActionButton
            primary
            onClick={handleNativeShare}
            icon={<IconShare className="size-4" />}
            label={t("share.share")}
            disabled={!blob}
          />
          <ActionButton
            onClick={handleWhatsApp}
            icon={<IconWhatsApp className="size-4" />}
            label={t("share.whatsapp")}
          />
          <ActionButton
            onClick={handleSave}
            icon={<IconDownload className="size-4" />}
            label={t("share.save")}
            disabled={!blob}
          />
          <ActionButton
            onClick={handleCopy}
            icon={<IconLink className="size-4" />}
            label={copied ? t("share.copied") : t("share.copyLink")}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  primary,
  disabled,
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

function buildShareText(ctx: StopCardCtx): string {
  const el = ctx.locale === "el";
  const lines: string[] = [];
  lines.push(el ? `Στάση ${ctx.stop.name}` : `${ctx.stop.name} bus stop`);
  if (ctx.nextEtaMin != null) {
    lines.push(
      el
        ? `Επόμενο λεωφορείο σε ${ctx.nextEtaMin} λεπτά`
        : `Next bus in ${ctx.nextEtaMin} min`,
    );
  }
  if (ctx.routes.length) {
    const codes = ctx.routes
      .slice(0, 5)
      .map((r) => r.short)
      .join(", ");
    lines.push(
      el ? `Γραμμές ${codes}` : `Routes ${codes}`,
    );
  }
  lines.push(el ? "Ζωντανά στο Aloya" : "Live on Aloya");
  return lines.join("\n");
}
