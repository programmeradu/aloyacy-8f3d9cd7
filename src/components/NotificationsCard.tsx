import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getDeviceId,
  getOrCreatePushSubscription,
  shouldRegisterSW,
  unsubscribePush,
} from "@/lib/pwa";
import { saveSubscription, sendTestPush, removeSubscription } from "@/lib/push.functions";
import {
  isSpeechEnabled,
  isSpeechSupported,
  primeSpeech,
  setSpeechEnabled,
  speak,
} from "@/lib/speech";
import { useI18n } from "@/lib/i18n";

type Status = "unknown" | "unsupported" | "preview" | "denied" | "off" | "on";

export function NotificationsCard() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>("unknown");

  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [speechOn, setSpeechOn] = useState(false);
  const speechSupported = isSpeechSupported();

  const save = useServerFn(saveSubscription);
  const test = useServerFn(sendTestPush);
  const remove = useServerFn(removeSubscription);

  const detect = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (!shouldRegisterSW()) {
      setStatus("preview");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") {
      setEndpoint(sub.endpoint);
      setStatus("on");
    } else {
      setStatus("off");
    }
  }, []);

  useEffect(() => {
    void detect();
    setSpeechOn(isSpeechEnabled());
  }, [detect]);

  function toggleSpeech() {
    const next = !speechOn;
    setSpeechEnabled(next);
    setSpeechOn(next);
    if (next) {
      primeSpeech();
      speak(t("notif.speech.priming"));
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }


  async function enable() {
    setPending(true);
    setMessage(null);
    try {
      const r = await getOrCreatePushSubscription();
      if (!r.ok) {
        setMessage(r.reason);
        await detect();
        return;
      }
      await save({
        data: {
          deviceId: getDeviceId(),
          subscription: r.subscription,
          userAgent: navigator.userAgent.slice(0, 480),
        },
      });
      setEndpoint(r.subscription.endpoint);
      setStatus("on");
      setMessage(t("notif.msg.enabled"));
    } catch (e) {
      console.error(e);
      setMessage(t("notif.msg.errEnable"));

    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    setMessage(null);
    try {
      if (endpoint) await remove({ data: { endpoint } });
      await unsubscribePush();
      setEndpoint(null);
      setStatus("off");
      setMessage(t("notif.msg.off"));
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
    }
  }

  async function sendTest() {
    setPending(true);
    setMessage(null);
    try {
      const res = await test({ data: { deviceId: getDeviceId() } });
      if (res.sent > 0) {
        setMessage(t("notif.msg.sent"));
      } else if (res.error) {
        setMessage(res.error);
      } else {
        setMessage(t("notif.msg.none"));
      }
    } catch (e) {
      console.error(e);
      setMessage(e instanceof Error ? e.message : t("notif.msg.errTest"));

    } finally {
      setPending(false);
    }
  }

  async function onToggle() {
    if (pending) return;
    if (status === "on") return disable();
    if (status === "off" || status === "denied") return enable();
  }

  const interactive = status === "on" || status === "off" || status === "denied";
  const isOn = status === "on";

  const copy = {
    unknown: { line: t("notif.line.unknown"), tone: "ink-soft" as const },
    unsupported: { line: t("notif.line.unsupported"), tone: "ink-soft" as const },
    preview: { line: t("notif.line.preview"), tone: "ink-soft" as const },
    denied: { line: t("notif.line.denied"), tone: "ochre" as const },
    off: { line: t("notif.line.off"), tone: "ink-soft" as const },
    on: { line: t("notif.line.on"), tone: "olive" as const },
  }[status];


  return (
    <article className="relative overflow-hidden rounded-[28px] bg-paper ring-1 ring-line">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aegean/40 to-transparent" />
      <div
        className={[
          "pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl transition-opacity duration-700",
          isOn ? "bg-aegean/20 opacity-100" : "bg-ink/5 opacity-60",
        ].join(" ")}
      />
      <div className="relative px-6 py-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              03 — Quiet alerts
            </p>
            <h3 className="font-display text-2xl mt-1 text-ink">
              Aloya, only when it <span className="italic text-aegean-deep">matters</span>
            </h3>
          </div>
          <span
            className={[
              "font-mono text-[10px] uppercase tracking-[0.22em] transition-colors",
              isOn ? "text-olive" : status === "denied" ? "text-ochre" : "text-ink-soft",
            ].join(" ")}
          >
            {isOn ? "Live" : status === "denied" ? "Blocked" : "Off"}
          </span>
        </div>

        <p className={`mt-3 text-sm leading-relaxed text-${copy.tone}`}>{copy.line}</p>

        {/* Premium toggle */}
        <div className="mt-6 flex items-center gap-5">
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label={isOn ? "Turn notifications off" : "Turn notifications on"}
            onClick={onToggle}
            disabled={!interactive || pending}
            className={[
              "group relative h-14 w-[112px] shrink-0 rounded-full outline-none",
              "ring-1 transition-all duration-500 ease-out",
              "focus-visible:ring-2 focus-visible:ring-aegean focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
              isOn
                ? "bg-gradient-to-r from-aegean to-aegean-deep ring-aegean-deep/40 shadow-[0_18px_40px_-18px_oklch(0.55_0.12_215/.55)]"
                : "bg-limestone ring-line",
              !interactive || pending ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            ].join(" ")}
          >
            {/* Tick marks inside the track */}
            <span
              aria-hidden
              className={[
                "absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.22em] transition-opacity duration-300",
                isOn ? "text-paper/90 opacity-100" : "opacity-0",
              ].join(" ")}
            >
              On
            </span>
            <span
              aria-hidden
              className={[
                "absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.22em] transition-opacity duration-300",
                isOn ? "opacity-0" : "text-ink-soft opacity-100",
              ].join(" ")}
            >
              Off
            </span>
            {/* Knob */}
            <span
              aria-hidden
              className={[
                "absolute top-1/2 h-11 w-11 -translate-y-1/2 rounded-full",
                "bg-paper shadow-[0_8px_20px_-6px_oklch(0.2_0.02_240/.35),0_2px_4px_oklch(0.2_0.02_240/.18)]",
                "transition-all duration-500 ease-[cubic-bezier(.32,.72,0,1)]",
                "ring-1 ring-ink/5",
                isOn ? "left-[calc(100%-2.875rem)]" : "left-[0.375rem]",
                pending ? "scale-95" : "group-active:scale-95",
              ].join(" ")}
            >
              {/* Inner medallion: aegean dot when on, olive ring when off */}
              <span
                className={[
                  "absolute inset-0 m-auto h-2 w-2 rounded-full transition-colors duration-500",
                  isOn ? "bg-aegean-deep" : "bg-ink-soft/40",
                ].join(" ")}
              />
              {pending && (
                <span className="absolute inset-1 rounded-full border-2 border-ink/15 border-t-aegean-deep animate-spin" />
              )}
            </span>
          </button>

          <div className="min-w-0">
            <p className="font-display text-lg text-ink leading-tight">
              {isOn ? "Notifications on" : "Notifications off"}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft mt-1">
              {pending
                ? "Working…"
                : isOn
                  ? "Tap to silence"
                  : status === "denied"
                    ? "Unblock in browser"
                    : status === "preview" || status === "unsupported"
                      ? "Unavailable here"
                      : "Tap to enable"}
            </p>
          </div>
        </div>

        {/* Secondary action */}
        {isOn && (
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button
              onClick={sendTest}
              disabled={pending}
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-aegean-deep underline-offset-4 transition hover:underline disabled:opacity-50"
            >
              Send a test ping
            </button>
            {speechSupported && (
              <button
                onClick={toggleSpeech}
                aria-pressed={speechOn}
                className={[
                  "font-mono text-[11px] uppercase tracking-[0.22em] underline-offset-4 transition hover:underline",
                  speechOn ? "text-olive" : "text-ink-soft",
                ].join(" ")}
              >
                {speechOn ? "Speak alerts: on" : "Speak alerts: off"}
              </button>
            )}
          </div>
        )}

        {message && (
          <p className="mt-4 font-mono text-[11px] tracking-wide text-ink-soft">{message}</p>
        )}

        <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { k: "01", t: "Board soon", d: "Head to your stop" },
            { k: "02", t: "Stop coming", d: "Press the button" },
            { k: "03", t: "Delays", d: "If the bus is late" },
          ].map((x) => (
            <li
              key={x.k}
              className="rounded-2xl bg-limestone/60 px-4 py-3 ring-1 ring-line/60"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                {x.k}
              </p>
              <p className="mt-1 font-display text-lg text-ink">{x.t}</p>
              <p className="text-xs text-ink-soft">{x.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
