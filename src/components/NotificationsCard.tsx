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
import { useRoamI18n } from "@/lib/roam-i18n";
import { Icon } from "@/components/roam/Icon";

type Status = "unknown" | "unsupported" | "preview" | "denied" | "off" | "on";

export function NotificationsCard() {
  const { t, r } = useRoamI18n();
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
    unknown: t("notif.line.unknown"),
    unsupported: t("notif.line.unsupported"),
    preview: t("notif.line.preview"),
    denied: t("notif.line.denied"),
    off: t("notif.line.off"),
    on: t("notif.line.on"),
  }[status];

  const hint = pending
    ? t("notif.hint.working")
    : isOn
      ? t("notif.hint.silence")
      : status === "denied"
        ? t("notif.hint.unblock")
        : status === "preview" || status === "unsupported"
          ? t("notif.hint.unavailable")
          : t("notif.hint.enable");

  const feats = [
    { icon: "person-simple-walk", t: t("notif.feat.board.t"), d: t("notif.feat.board.d") },
    { icon: "bell-ringing", t: t("notif.feat.stop.t"), d: t("notif.feat.stop.d") },
    { icon: "warning-circle", t: t("notif.feat.delay.t"), d: t("notif.feat.delay.d") },
  ];

  return (
    <div className="roam flex flex-col gap-3">
      <div className="r-me-group">
        <div className="r-row r-me-row">
          <span className="r-me-ic">
            <Icon name={isOn ? "bell-simple-ringing" : "bell-simple-slash"} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[16px] font-medium leading-tight">
              {isOn ? t("notif.label.on") : t("notif.label.off")}
            </span>
            <span className="r-lbl block mt-0.5">{hint}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label={isOn ? t("notif.aria.off") : t("notif.aria.on")}
            onClick={onToggle}
            disabled={!interactive || pending}
            className="r-switch"
            data-busy={pending || undefined}
          />
        </div>
        {isOn && speechSupported ? (
          <div className="r-row r-me-row">
            <span className="r-me-ic">
              <Icon name="speaker-high" />
            </span>
            <span className="flex-1 min-w-0 text-[16px] font-medium">{r("alerts.speak")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={speechOn}
              aria-label={r("alerts.speak")}
              onClick={toggleSpeech}
              className="r-switch"
            />
          </div>
        ) : null}
        {isOn ? (
          <button
            type="button"
            className="r-row r-me-row w-full"
            onClick={sendTest}
            disabled={pending}
          >
            <span className="r-me-ic">
              <Icon name="paper-plane-tilt" />
            </span>
            <span className="flex-1 min-w-0 text-left text-[16px] font-medium">
              {t("notif.test")}
            </span>
            <Icon name="caret-right" size={16} style={{ color: "var(--r-mute)" }} />
          </button>
        ) : null}
      </div>
      <p className="r-lbl px-2" aria-live="polite">
        {message ?? copy}
      </p>
      <div className="r-me-group">
        {feats.map((x) => (
          <div key={x.t} className="r-row r-me-row">
            <span className="r-me-ic">
              <Icon name={x.icon} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-medium leading-tight">{x.t}</span>
              <span className="r-lbl block mt-0.5">{x.d}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
