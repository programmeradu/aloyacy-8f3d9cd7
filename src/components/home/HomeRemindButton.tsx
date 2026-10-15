// "Remind me" on the Sky Clock card. Same backend as the Trips RemindMeButton
// (`scheduleDeparture`, push 5 min before the rider must start walking), same
// anonymous-first auth + notification-permission flow. When no listed bus can
// still be reminded about, it becomes a link to the stop's live board so the
// button is never dead.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/useAuth";
import { bootstrapAnonymousAuth } from "@/lib/anon-auth";
import { scheduleDeparture } from "@/lib/scheduled-departures.functions";
import { NotificationPromptSheet } from "@/components/NotificationPromptSheet";
import { track } from "@/lib/analytics";
import { useI18n } from "@/lib/i18n";
import { Ph } from "./SkyIcons";
import { fmtCyprusTime, remindTarget, type NextBus } from "./sky-state";

export function HomeRemindButton({ bus, origin }: { bus: NextBus; origin: { lat: number; lng: number; label: string } }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const schedule = useServerFn(scheduleDeparture);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  const target = remindTarget(bus, nowSec);
  const sigKey = target ? `aloya:remind:home:${bus.stopId}@${bus.routeId}:${Math.round(target.arrivalUnix / 60)}` : "";
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    if (!sigKey) return;
    try {
      const raw = window.localStorage.getItem(sigKey);
      setState(raw && Number(raw) * 1000 > Date.now() ? "saved" : "idle");
    } catch {
      setState("idle");
    }
  }, [sigKey]);

  if (!target) {
    return (
      <Link to="/stop/$stopId" params={{ stopId: bus.stopId }} className="sky-btn">
        <Ph name="bus" size={18} />
        {t("sky.remind.stopTimes")}
      </Link>
    );
  }

  const time = fmtCyprusTime(target.arrivalUnix);

  async function doSchedule() {
    if (!target) return;
    setState("saving");
    try {
      await schedule({
        data: {
          arriveByUnix: target.arrivalUnix,
          remindAtUnix: target.remindAtUnix,
          plan: {
            fromLabel: origin.label,
            toLabel: bus.stopName,
            fromLat: origin.lat,
            fromLng: origin.lng,
            toLat: bus.stopLat,
            toLng: bus.stopLng,
            leaveByUnix: target.arrivalUnix - bus.walkSec,
            legs: [
              { kind: "walk", durationSec: bus.walkSec },
              { kind: "ride", routeId: bus.routeId, routeShort: bus.line },
            ],
          },
        },
      });
      setState("saved");
      try {
        window.localStorage.setItem(sigKey, String(target.arrivalUnix));
      } catch {}
      track("ui:remind-me.saved", { surface: "home" });
    } catch {
      track("ui:remind-me.error", { surface: "home" });
      setState("error");
    }
  }

  function proceed() {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      setNotifOpen(true);
    } else {
      void doSchedule();
    }
  }

  function onClick() {
    track("ui:remind-me.tap", { surface: "home" });
    if (!user) {
      void bootstrapAnonymousAuth().then(proceed);
      return;
    }
    proceed();
  }

  const label =
    state === "saved"
      ? t("sky.remind.set")
      : state === "saving"
        ? t("sky.remind.saving")
        : state === "error"
          ? t("sky.remind.retry")
          : target.isNext
            ? t("sky.remind.cta")
            : t("sky.remind.ctaAt", { time });

  return (
    <>
      <button
        type="button"
        className="sky-btn"
        onClick={onClick}
        disabled={state === "saving" || state === "saved"}
        aria-label={t("sky.remind.aria", { time })}
      >
        <Ph name={state === "error" ? "warn" : "bell"} size={18} />
        {label}
      </button>
      <NotificationPromptSheet
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onSuccess={() => void doSchedule()}
        reason="departure"
      />
    </>
  );
}
