import { useState } from "react";
import { IconBell, IconClose } from "@/components/Icons";
import { getDeviceId, getOrCreatePushSubscription } from "@/lib/pwa";
import { saveSubscription } from "@/lib/push.functions";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";

export type NotificationPromptProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  reason?: "departure" | "alight" | "disruption" | "general";
};

export function NotificationPromptSheet({
  open,
  onClose,
  onSuccess,
  reason = "general",
}: NotificationPromptProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = useServerFn(saveSubscription);

  if (!open) return null;

  async function handleEnable() {
    setLoading(true);
    setErr(null);
    try {
      const r = await getOrCreatePushSubscription();
      if (!r.ok) {
        setErr(r.reason ?? "Notification permission was denied.");
        return;
      }
      await save({
        data: {
          deviceId: getDeviceId(),
          subscription: r.subscription,
          userAgent: navigator.userAgent.slice(0, 480),
        },
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to enable notifications");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-ink/60 backdrop-blur-sm animate-fade-in p-0 sm:p-4"
    >
      <div className="w-full max-w-md rounded-t-[32px] sm:rounded-[32px] bg-card p-6 ring-1 ring-line shadow-2xl animate-rise">
        <div className="flex items-center justify-between pb-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-aegean-soft/70 text-aegean-deep ring-1 ring-aegean-soft">
            <IconBell className="size-5" />
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full bg-limestone-soft text-ink-soft hover:text-ink ring-1 ring-line"
          >
            <IconClose className="size-4" />
          </button>
        </div>

        <h3 className="mt-2 font-display text-2xl text-ink leading-snug">
          {reason === "departure"
            ? "Never miss your bus"
            : reason === "disruption"
              ? "Stay ahead of line delays"
              : "Live Transit Alerts"}
        </h3>
        <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
          {reason === "departure"
            ? "Aloya will remind you when it's time to step out the door, automatically adjusted for walking distance and weather."
            : reason === "disruption"
              ? "Get timely alerts when major delays, detours, or cancellations affect this bus line."
              : "Aloya alerts you when your bus arrives, when to ring the stop bell, and if your line faces unexpected delays."}
        </p>

        <div className="mt-4 space-y-2.5 rounded-2xl bg-limestone-soft/70 p-3.5 ring-1 ring-line text-[12px] text-ink">
          <div className="flex items-start gap-2.5">
            <span className="text-base leading-none">🚶</span>
            <span>
              <strong>Smart departure timing:</strong> Walking buffer with weather padding.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="text-base leading-none">📳</span>
            <span>
              <strong>Haptic stop alerts:</strong> Phone vibrates right before your stop so you never miss it.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="text-base leading-none">⚡</span>
            <span>
              <strong>Zero spam:</strong> Strictly tied to your active journeys and favorite lines.
            </span>
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-xl bg-crimson-soft/70 p-2.5 text-[12px] text-crimson">
            {err}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={handleEnable}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 font-sans text-sm font-semibold text-limestone shadow-sm hover:bg-ink/90 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "Enabling..." : "Enable Alerts"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-center text-[12px] font-medium text-ink-soft hover:text-ink"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
