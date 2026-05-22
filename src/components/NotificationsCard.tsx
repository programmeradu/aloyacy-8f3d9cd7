import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getDeviceId,
  getOrCreatePushSubscription,
  shouldRegisterSW,
  unsubscribePush,
} from "@/lib/pwa";
import { saveSubscription, sendTestPush, removeSubscription } from "@/lib/push.functions";

type Status = "unknown" | "unsupported" | "preview" | "denied" | "off" | "on";

export function NotificationsCard() {
  const [status, setStatus] = useState<Status>("unknown");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
  }, [detect]);

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
      setMessage("Notifications enabled.");
    } catch (e) {
      console.error(e);
      setMessage("Could not enable notifications.");
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
      setMessage("Notifications turned off.");
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
      setMessage(
        res.sent > 0
          ? "Test notification sent. Check your device."
          : "No active subscriptions found.",
      );
    } catch (e) {
      console.error(e);
      setMessage("Could not send test notification.");
    } finally {
      setPending(false);
    }
  }

  const copy = {
    unknown: { line: "Checking notification status…", tone: "ink-soft" as const },
    unsupported: {
      line: "This browser does not support push notifications.",
      tone: "ink-soft" as const,
    },
    preview: {
      line: "Notifications work on the installed app. Open the published site or add Aloya to your home screen.",
      tone: "ink-soft" as const,
    },
    denied: {
      line: "Notifications are blocked. Allow them in your browser settings to receive bus alerts.",
      tone: "ochre" as const,
    },
    off: {
      line: "Turn on quiet alerts for boarding, alighting, and delays.",
      tone: "ink-soft" as const,
    },
    on: {
      line: "On. We will only ping for boarding, alighting, and disruptions.",
      tone: "olive" as const,
    },
  }[status];

  return (
    <article className="relative overflow-hidden rounded-[28px] bg-paper ring-1 ring-line">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aegean/40 to-transparent" />
      <div className="px-6 py-6">
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
              "font-mono text-[10px] uppercase tracking-[0.22em]",
              status === "on" ? "text-olive" : "text-ink-soft",
            ].join(" ")}
          >
            {status === "on" ? "Live" : status === "denied" ? "Blocked" : "Off"}
          </span>
        </div>

        <p className={`mt-3 text-sm leading-relaxed text-${copy.tone}`}>{copy.line}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {status === "on" ? (
            <>
              <button
                onClick={sendTest}
                disabled={pending}
                className="rounded-full bg-aegean px-5 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-paper transition hover:bg-aegean-deep disabled:opacity-50"
              >
                Send test ping
              </button>
              <button
                onClick={disable}
                disabled={pending}
                className="rounded-full px-5 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft ring-1 ring-line transition hover:text-ink disabled:opacity-50"
              >
                Turn off
              </button>
            </>
          ) : (
            <button
              onClick={enable}
              disabled={pending || status === "unsupported" || status === "preview"}
              className="rounded-full bg-ink px-5 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-paper transition hover:bg-ink/85 disabled:opacity-40"
            >
              {pending ? "Enabling…" : "Enable notifications"}
            </button>
          )}
        </div>

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
