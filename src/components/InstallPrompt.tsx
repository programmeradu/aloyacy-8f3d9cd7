// Mobile install prompt. Shown once when a rider opens Aloya in a phone
// browser (not from the installed PWA). On Android/Chromium, taps a real
// `beforeinstallprompt` event so the OS install sheet appears immediately.
// On iOS Safari there is no programmatic install — we render a clear,
// labelled "tap Share → Add to Home Screen" walkthrough instead.
//
// Editorial styling: hand-drawn hero, generous radii, soft shadows, no
// emojis, no bullet characters. Bilingual via `useI18n`.

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import heroAsset from "@/assets/install-prompt-hero.jpg";

const DISMISS_KEY = "aloya:install-prompt:dismissed-at";
const INSTALLED_KEY = "aloya:install-prompt:installed";
const SHOW_AFTER_MS = 1500; // small delay so it doesn't slam the first paint
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days after dismiss

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  return false;
}

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports as Mac — detect via touch points.
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (ua.includes("Mac") && navigator.maxTouchPoints > 1) return true;
  return false;
}

function isInLovablePreview(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  return (
    h.includes("id-preview--") ||
    h.includes("lovableproject.com") ||
    h.includes("lovable.dev")
  );
}

function recentlyDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
  if (!at) return false;
  return Date.now() - at < SNOOZE_MS;
}

export function InstallPrompt() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const ios = isIOS();

  // Capture the browser's deferred install event so we can fire it on tap.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setBipEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {}
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Decide whether to show.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInLovablePreview()) return;
    if (isStandalone()) return;
    if (!isMobileBrowser()) return;
    try {
      if (localStorage.getItem(INSTALLED_KEY) === "1") return;
    } catch {}
    if (recentlyDismissed()) return;

    // On Android we ideally wait for the BIP event so the native sheet works;
    // but we still show the sheet after a short delay even if BIP hasn't
    // fired — on iOS BIP never fires, and on some Android browsers it's
    // delayed. The CTA falls back to the manual walkthrough.
    const id = window.setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);

  const close = (snooze: boolean) => {
    if (snooze) {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {}
    }
    setOpen(false);
  };

  const onInstallTap = async () => {
    if (bipEvent) {
      try {
        await bipEvent.prompt();
        const choice = await bipEvent.userChoice;
        if (choice.outcome === "accepted") {
          try {
            localStorage.setItem(INSTALLED_KEY, "1");
          } catch {}
          setOpen(false);
          return;
        }
      } catch {}
    }
    // iOS or Android browser without BIP — keep sheet open so the user can
    // follow the walkthrough below.
  };

  if (!open) return null;

  const el = locale === "el";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-prompt-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={() => close(true)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-limestone rounded-t-[32px] sm:rounded-[32px] ring-1 ring-line shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500"
      >
        <div className="relative aspect-[5/3] w-full bg-ochre-soft overflow-hidden">
          <img
            src={heroAsset}
            alt=""
            width={1024}
            height={768}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="px-6 pt-5 pb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-aegean">
            {el ? "Εγκατάσταση" : "Install"}
          </p>
          <h2
            id="install-prompt-title"
            className="mt-2 font-display text-[26px] leading-[1.1] text-ink"
          >
            {el ? "Βάλε την Aloya στην αρχική σου οθόνη" : "Put Aloya on your home screen"}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            {el
              ? "Άνοιξέ την με ένα άγγιγμα, λάβε ειδοποιήσεις «φύγε τώρα», και δούλεψε ακόμη και χωρίς σήμα. Καμία λήψη από store, χωρίς λογαριασμό."
              : "Open it with one tap, get \u201Cleave now\u201D alerts, and use it even without signal. No app store, no account needed."}
          </p>

          {ios ? (
            <ol className="mt-5 space-y-3">
              <Step
                n={1}
                label={
                  el
                    ? "Πάτησε το εικονίδιο Κοινής χρήσης στο κάτω μέρος του Safari"
                    : "Tap the Share icon at the bottom of Safari"
                }
                glyph={<ShareGlyph />}
              />
              <Step
                n={2}
                label={
                  el
                    ? "Επίλεξε «Στην οθόνη Αφετηρίας»"
                    : "Choose \u201CAdd to Home Screen\u201D"
                }
                glyph={<HomeGlyph />}
              />
              <Step
                n={3}
                label={
                  el ? "Πάτησε «Προσθήκη» πάνω δεξιά" : "Tap \u201CAdd\u201D in the top right"
                }
                glyph={<AddGlyph />}
              />
            </ol>
          ) : null}

          <div className="mt-6 flex flex-col gap-2">
            {!ios && (
              <button
                onClick={onInstallTap}
                className="inline-flex items-center justify-center rounded-full bg-ink px-6 py-4 text-[15px] font-semibold text-limestone transition-colors hover:bg-ink/90 active:scale-[0.99]"
              >
                {bipEvent
                  ? el
                    ? "Εγκατάσταση Aloya"
                    : "Install Aloya"
                  : el
                  ? "Πώς να εγκαταστήσω"
                  : "Show me how"}
              </button>
            )}
            <button
              onClick={() => close(true)}
              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[13px] font-medium text-ink-soft hover:text-ink transition-colors"
            >
              {el ? "Όχι τώρα" : "Maybe later"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, label, glyph }: { n: number; label: string; glyph: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="shrink-0 mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-aegean/15 font-mono text-[12px] font-semibold text-aegean">
        {n}
      </span>
      <span className="flex-1 text-[14px] leading-snug text-ink flex items-center gap-2">
        <span className="flex-1">{label}</span>
        <span className="shrink-0 text-ink-soft">{glyph}</span>
      </span>
    </li>
  );
}

function ShareGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
function HomeGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function AddGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
