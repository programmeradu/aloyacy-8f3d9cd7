// Install card (Roam). A compact card docked above the tab bar when a rider
// opens Aloya in a phone browser. Android and Chrome get an Install button
// wired to `beforeinstallprompt`; iOS Safari has no programmatic install, so
// it shows the two real steps: the Share button, then Add to Home Screen.
// Hidden in the installed app, while any modal sheet is open, and for 14 days
// after the rider closes it.

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

const DISMISS_KEY = "aloya:install-prompt:dismissed-at";
const INSTALLED_KEY = "aloya:install-prompt:installed";
const SHOW_AFTER_MS = 1500;
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  return false;
}

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return ua.includes("Mac") && navigator.maxTouchPoints > 1;
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
    h.includes("id-preview--") || h.includes("lovableproject.com") || h.includes("lovable.dev")
  );
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
    return !!at && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

const COPY = {
  en: {
    region: "Install Aloya",
    title: "Add Aloya to your home screen",
    benefit: "Opens in one tap and works without signal.",
    close: "Not now",
    install: "Install",
    tap: "Tap",
    inSafari: "in Safari",
    then: "then",
    addHome: "Add to Home Screen",
    menu: "Open the browser menu, then Install app.",
  },
  el: {
    region: "Εγκατάσταση Aloya",
    title: "Πρόσθεσε την Aloya στην αρχική οθόνη",
    benefit: "Ανοίγει με ένα άγγιγμα και δουλεύει χωρίς σήμα.",
    close: "Όχι τώρα",
    install: "Εγκατάσταση",
    tap: "Πάτησε",
    inSafari: "στο Safari",
    then: "και μετά",
    addHome: "Προσθήκη στην οθόνη Αφετηρίας",
    menu: "Άνοιξε το μενού του browser και πάτησε Εγκατάσταση εφαρμογής.",
  },
} as const;

/** Distance from the viewport bottom to the top of the tab bar, or null. */
function tabBarClearance(): number | null {
  const tabs = document.querySelector(".r-tabs");
  if (!tabs) return null;
  const r = tabs.getBoundingClientRect();
  if (r.height === 0) return null;
  return Math.max(0, window.innerHeight - r.top);
}

export function InstallPrompt() {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [covered, setCovered] = useState(false);
  const [clear, setClear] = useState<number | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIos(isIOS());
    const onBip = (e: Event) => {
      e.preventDefault();
      setBipEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        /* storage blocked */
      }
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInLovablePreview() || isStandalone() || !isMobileBrowser()) return;
    try {
      if (localStorage.getItem(INSTALLED_KEY) === "1") return;
    } catch {
      /* storage blocked */
    }
    if (recentlyDismissed()) return;
    const id = window.setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);

  // While open: follow the tab bar and step aside for any modal sheet.
  useEffect(() => {
    if (!open) return;
    const check = () => {
      setCovered(!!document.querySelector('[role="dialog"][aria-modal="true"]'));
      setClear(tabBarClearance());
      if (isStandalone()) setOpen(false);
    };
    check();
    const id = window.setInterval(check, 400);
    window.addEventListener("resize", check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", check);
    };
  }, [open]);

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage blocked */
    }
    setOpen(false);
  };

  const onInstall = async () => {
    if (!bipEvent) return;
    try {
      await bipEvent.prompt();
      const choice = await bipEvent.userChoice;
      if (choice.outcome === "accepted") {
        try {
          localStorage.setItem(INSTALLED_KEY, "1");
        } catch {
          /* storage blocked */
        }
        setOpen(false);
      }
    } catch {
      /* prompt already used */
    }
    setBipEvent(null);
  };

  if (!open || covered) return null;

  const c = locale === "el" ? COPY.el : COPY.en;
  const bottom =
    clear != null
      ? `${clear + 10}px`
      : "calc(max(var(--r-safe-bottom, env(safe-area-inset-bottom, 0px)), 12px) + 4px)";

  return (
    <div className="roam-root r-install-wrap" style={{ bottom }}>
      <section className="r-install r-rise" role="region" aria-label={c.region}>
        <div className="r-install-top">
          <img className="r-install-icon" src="/icon-192.png" alt="" width={44} height={44} />
          <div className="r-install-text">
            <p className="r-install-title">{c.title}</p>
            <p className="r-install-benefit">{c.benefit}</p>
          </div>
          {!ios && bipEvent ? (
            <button type="button" className="r-install-btn" onClick={onInstall}>
              {c.install}
            </button>
          ) : null}
          <button type="button" className="r-install-x" aria-label={c.close} onClick={close}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {ios ? (
          <p className="r-install-steps">
            <span className="r-install-step">
              <b>1</b>
              {c.tap}
              <ShareGlyph />
              {c.inSafari}
            </span>
            <span className="r-install-step">
              <b>2</b>
              {c.then}
              <span className="r-install-strong">
                {c.addHome}
                <AddGlyph />
              </span>
            </span>
          </p>
        ) : !bipEvent ? (
          <p className="r-install-steps">
            <span className="r-install-step">{c.menu}</span>
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** The iOS Share symbol: a box open at the top with an arrow leaving it. */
function ShareGlyph() {
  return (
    <svg className="r-install-glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M9 9.5H7.5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 14.5V2.8M8.4 6.2 12 2.6l3.6 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The iOS Add to Home Screen symbol: a plus in a rounded square. */
function AddGlyph() {
  return (
    <svg
      className="r-install-glyph r-install-glyph--ink"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
    >
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
