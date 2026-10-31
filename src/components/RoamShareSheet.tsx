// Roam share sheet: one calm sheet for every share in the app (stop, airport,
// line, plan, group). The picture is the 4:5 share card drawn on the Worker by
// the same renderer as the link previews (/api/public/og/*?f=p): the real
// network map, the signpost pin, line colours and the Aloya logo. The sheet
// previews it and offers Share, WhatsApp, Save image and Copy link.
//
// When a file is attached the link rides in the text, not in `url`, so apps
// like WhatsApp keep the picture instead of swapping in the link preview.

import { useEffect, useState, type ReactNode } from "react";
import { Sheet } from "@/components/roam/Sheet";
import { Icon } from "@/components/roam/Icon";
import { IconWhatsApp } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

export type RoamShareProps = {
  open: boolean;
  onClose: () => void;
  /** Sheet title, e.g. "Share this stop". */
  title: string;
  /** Same-origin URL of the 4:5 card PNG. */
  imageUrl: string | null;
  /** The page being shared (on the current origin). */
  shareUrl: string;
  /** Plain message that goes with the picture (the link is added here). */
  shareText: string;
  /** Download name without extension, e.g. "aloya-stop-4237". */
  fileName: string;
};

export function RoamShareSheet({
  open,
  onClose,
  title,
  imageUrl,
  shareUrl,
  shareText,
  fileName,
}: RoamShareProps) {
  const { t } = useI18n();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Fetch the card while the sheet is open; refetch when the live bits change.
  useEffect(() => {
    if (!open || !imageUrl) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setFailed(false);
    fetch(imageUrl, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const b = await res.blob();
        if (!b.type.startsWith("image/")) throw new Error("not an image");
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setPreview(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) {
        const u = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(u), 2000);
      }
    };
  }, [open, imageUrl]);

  useEffect(() => {
    if (!open) setNotice(null);
  }, [open]);

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 2600);
  }

  const text = `${shareText}\n${shareUrl}`;

  function makeFile(): File | null {
    if (!blob) return null;
    const ext = blob.type === "image/jpeg" ? "jpg" : "png";
    return new File([blob], `${fileName}.${ext}`, { type: blob.type || "image/png" });
  }

  function canShareFile(file: File): boolean {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    return !!nav.canShare && nav.canShare({ files: [file] });
  }

  function download(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  async function onShare() {
    const file = makeFile();
    if (file && canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title, text });
      } catch {
        /* dismissed */
      }
      return;
    }
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
      } catch {
        /* dismissed */
      }
      return;
    }
    await onCopy();
  }

  async function onWhatsApp() {
    const file = makeFile();
    if (file && canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title, text });
      } catch {
        /* dismissed */
      }
      return;
    }
    // Desktop: save the picture, copy the message, open WhatsApp Web.
    if (file) download(file);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
    window.open(
      `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
    if (file) flash(t("share.waFallback"));
  }

  async function onSave() {
    const file = makeFile();
    if (!file) return;
    if (canShareFile(file) && isLikelyMobile()) {
      try {
        await navigator.share({ files: [file], title });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    download(file);
    flash(t("share.saved"));
  }

  return (
    <Sheet open={open} onClose={onClose} label={title} closeLabel={t("share.close")}>
      <div style={{ padding: "4px 6px 0" }} data-share-sheet>
        <h2 className="r-t2" style={{ margin: 0 }}>
          {title}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.4, color: "var(--r-ink2)" }}>
          {t("share.subtitle")}
        </p>

        <div
          style={{
            margin: "18px auto 0",
            width: "min(100%, 264px)",
            aspectRatio: "4 / 5",
            borderRadius: 22,
            overflow: "hidden",
            background: "var(--r-canvas)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04)",
            position: "relative",
          }}
          aria-busy={!preview && !failed}
        >
          {preview ? (
            <img
              src={preview}
              alt={t("share.previewAlt")}
              data-share-card
              style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
            />
          ) : (
            <span
              role="status"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                textAlign: "center",
                fontSize: 14,
                lineHeight: 1.4,
                color: "var(--r-mute)",
              }}
            >
              {failed ? t("share.cardFailed") : t("share.rendering")}
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
          <ShareButton
            primary
            onClick={onShare}
            icon={<Icon name="export" size={19} />}
            label={t("share.share")}
          />
          <ShareButton
            onClick={onWhatsApp}
            icon={
              <span style={{ display: "inline-flex", color: "#1f9e4f" }}>
                <IconWhatsApp className="size-[19px]" />
              </span>
            }
            label={t("share.whatsapp")}
          />
          <ShareButton
            onClick={onSave}
            disabled={!blob}
            icon={<Icon name="download-simple" size={19} />}
            label={t("share.save")}
          />
          <ShareButton
            onClick={onCopy}
            icon={<Icon name={copied ? "check" : "link-simple"} size={19} />}
            label={copied ? t("share.copied") : t("share.copyLink")}
          />
        </div>

        <div aria-live="polite" style={{ minHeight: 20, marginTop: 12, textAlign: "center" }}>
          {notice ? <span style={{ fontSize: 14, color: "var(--r-mute)" }}>{notice}</span> : null}
        </div>
      </div>
    </Sheet>
  );
}

function ShareButton({
  onClick,
  icon,
  label,
  primary,
  disabled,
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 52,
        borderRadius: 26,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontSize: 16,
        fontWeight: 600,
        background: primary ? "var(--r-char)" : "var(--r-pill)",
        color: primary ? "#fff" : "var(--r-ink)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        border: 0,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

/** URL of the 4:5 share picture for an OG endpoint; empty values are dropped. */
export function shareCardUrl(
  path: string,
  params: Record<string, string | number | null | undefined> = {},
): string {
  const q = new URLSearchParams({ f: "p" });
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    q.set(k, String(v));
  }
  return `${path}?${q.toString()}`;
}

/** The current origin (the app's own host), never a hard-coded domain. */
export function currentOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}
