import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQrSvg } from "@/lib/useQr";
import { readPass, formatCardNumber, type MotionPass } from "@/lib/motion-pass";
import { timeAgo } from "@/components/wallet/utils";
import { IconArrowLeft } from "@/components/Icons";

export const Route = createFileRoute("/wallet/pass")({
  head: () => ({
    meta: [
      { title: "Motion Pass — Scan" },
      { name: "description", content: "Lock-screen view of your Motion bus card. Big QR for the kiosk." },
      // Hint browser to use the limestone bg on iOS PWA status bar.
      { name: "theme-color", content: "#f5f1e8" },
    ],
  }),
  component: WalletPassRoute,
});

function useInstallHint() {
  const [hint, setHint] = useState<"ios" | "android" | "installed" | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      // @ts-expect-error iOS-only field
      window.navigator.standalone === true;
    if (standalone) {
      setHint("installed");
      return;
    }
    const ua = window.navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) setHint("ios");
    else if (/Android/i.test(ua)) setHint("android");
    else setHint(null);
  }, []);
  return hint;
}

function WalletPassRoute() {
  const [pass, setPass] = useState<MotionPass>(() => readPass());
  const hint = useInstallHint();

  useEffect(() => {
    const sync = () => setPass(readPass());
    window.addEventListener("aloya:motionpass", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("aloya:motionpass", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Keep the screen awake while the user is showing the QR.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const tryLock = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock;
        lock = (await wl?.request?.("screen")) ?? null;
      } catch {
        // permission denied or unsupported — silent
      }
    };
    void tryLock();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !lock && !cancelled) void tryLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.().catch(() => {});
    };
  }, []);

  // Crank brightness on iOS by pushing white background while card is shown.
  // We rely on bg color only — no API exists to set device brightness from web.

  const clean = pass.number.replace(/\D/g, "");
  const hasCard = clean.length >= 8;
  const qrValue = hasCard ? clean : "MOTION-DEMO";
  const qrSvg = useQrSvg(qrValue, { color: "#0c1a2b", margin: 0 });

  const holder = useMemo(
    () => (pass.holder?.trim() || pass.jcc?.displayName?.trim() || "").toUpperCase(),
    [pass.holder, pass.jcc?.displayName],
  );

  return (
    <main className="min-h-svh bg-limestone text-ink flex flex-col">
      <header className="px-6 pt-3 pb-2 flex items-center justify-between">
        <a
          href="/wallet"
          className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink"
          aria-label="Back to wallet"
        >
          <IconArrowLeft className="size-4" />
        </a>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Show at kiosk
        </p>
        <span className="size-10" />
      </header>

      {/* Pass — wallet-style card front, full bleed within safe gutter */}
      <section className="px-5 mt-2">
        <article className="relative rounded-[28px] bg-white ring-1 ring-line shadow-[0_30px_80px_-40px_rgba(8,28,40,0.45)] overflow-hidden">
          <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                Motion Pass
              </p>
              <p className="mt-2 font-display text-[28px] leading-none text-ink">
                {holder || "Your card"}
              </p>
              {pass.passName && (
                <p className="mt-2 text-[12px] text-ink-soft truncate">{pass.passName}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                Balance
              </p>
              <p className="mt-1 font-display text-[28px] leading-none text-aegean-deep tabular-nums">
                €{pass.balanceEur.toFixed(2)}
              </p>
              {pass.balanceUpdatedAt > 0 && (
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                  {timeAgo(pass.balanceUpdatedAt)}
                </p>
              )}
            </div>
          </div>

          {/* Hairline rule */}
          <div className="mx-6 h-px bg-line" />

          {/* QR — the hero */}
          <div className="px-6 pt-6 pb-4 flex items-center justify-center">
            <div className="aspect-square w-full max-w-[340px] bg-white p-3 ring-1 ring-line rounded-2xl">
              {qrSvg ? (
                <div
                  className="size-full [&_svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div className="size-full bg-ink/5" />
              )}
            </div>
          </div>

          <div className="px-6 pb-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              Card number
            </p>
            <p className="mt-1 font-mono text-[16px] tracking-[0.12em] text-ink tabular-nums">
              {hasCard ? formatCardNumber(clean) : "Add a card first"}
            </p>
          </div>
        </article>
      </section>

      {/* Install / wallet hint */}
      <section className="px-6 mt-6 pb-10">
        {hint === "installed" ? (
          <p className="text-[12px] text-ink-soft text-center">
            Tip — bookmark this page on your home screen for one-tap access at the stop.
          </p>
        ) : hint === "ios" ? (
          <div className="rounded-[20px] bg-card ring-1 ring-line p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              Add to iPhone home screen
            </p>
            <p className="mt-2 text-[13px] text-ink leading-snug">
              In Safari, tap{" "}
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] bg-white ring-1 ring-line rounded px-1.5 py-0.5">
                Share
              </span>{" "}
              then{" "}
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] bg-white ring-1 ring-line rounded px-1.5 py-0.5">
                Add to Home Screen
              </span>
              . Aloya opens straight to your pass.
            </p>
          </div>
        ) : hint === "android" ? (
          <div className="rounded-[20px] bg-card ring-1 ring-line p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              Add to Android home screen
            </p>
            <p className="mt-2 text-[13px] text-ink leading-snug">
              In Chrome, tap the menu then{" "}
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] bg-white ring-1 ring-line rounded px-1.5 py-0.5">
                Install app
              </span>
              . Your pass becomes a one-tap launcher.
            </p>
          </div>
        ) : null}

        <p className="mt-6 text-[11px] text-ink-soft text-center max-w-sm mx-auto">
          Official Apple Wallet and Google Wallet passes need an issuer certificate from
          Cyprus Public Transport. Until they offer one, this is the closest thing — your
          card, ready to scan, on your lock screen.
        </p>
      </section>
    </main>
  );
}
