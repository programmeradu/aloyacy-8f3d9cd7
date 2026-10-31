// The action under the live leg cards (Roam): the one thing the rider can do
// right now, which changes with the live phase of the journey.

import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/roam/Icon";
import { useI18n } from "@/lib/i18n";
import { clearActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import {
  multiLegConfirmOnBoard,
  multiLegMarkArrived,
  type MultiLegLive,
} from "@/lib/useMultiLegJourney";
import { startLiveTracking } from "@/lib/useJourney";
import { requestCompassPermission } from "@/lib/useCompass";

const BTN =
  "mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold active:scale-[0.98] motion-reduce:active:scale-100 transition-transform";

function Card({
  tone = "white",
  kicker,
  title,
  body,
  children,
}: {
  tone?: "white" | "yellow";
  kicker?: string;
  title?: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className="rounded-[24px] px-[18px] py-4"
      style={
        tone === "yellow"
          ? { background: "var(--r-y-soft)", boxShadow: "0 0 0 1.5px var(--r-y)" }
          : { background: "#fff", boxShadow: "0 0 0 1px var(--r-line)" }
      }
    >
      {kicker ? <p className="r-lbl">{kicker}</p> : null}
      {title ? <p className="mt-1 text-[20px] font-medium leading-tight">{title}</p> : null}
      {body ? <p className="mt-1.5 text-[14px] leading-snug text-[var(--r-ink2)]">{body}</p> : null}
      {children}
    </section>
  );
}

export function MultiLegActions({
  live,
  active,
  onImOff,
}: {
  live: MultiLegLive;
  active: ActiveTrip;
  onImOff: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  if (!live.active) {
    return (
      <Card
        kicker={t("hud.liveGuidance")}
        title={t("ml.act.startTitle", { name: active.to.label })}
        body={t("ml.act.startBody")}
      >
        <button
          type="button"
          onClick={() => {
            // Start immediately so the UI flips into live mode even if
            // the compass permission prompt stalls or the user dismisses
            // it. Compass is an enhancement, not a gate.
            startLiveTracking();
            void requestCompassPermission().catch(() => {});
          }}
          className={BTN}
          style={{ background: "var(--r-y)", color: "var(--r-ink)" }}
        >
          {t("ml.act.startCta")}
          <Icon name="arrow-up-right" size={16} />
        </button>
      </Card>
    );
  }

  if (live.phase === "waiting-to-board") {
    return (
      <Card
        kicker={t("ml.act.onBoardQ", { code: live.currentRideLeg?.routeShort ?? "" })}
        body={t("ml.act.onBoardBody", { name: live.currentRideLeg?.alight.name ?? "" })}
      >
        <button
          type="button"
          onClick={() => multiLegConfirmOnBoard()}
          className={BTN}
          style={{ background: "var(--r-char)", color: "#fff" }}
        >
          {t("ml.act.onBoardCta")}
          <Icon name="bus" size={16} />
        </button>
      </Card>
    );
  }

  if (live.phase === "alight-soon") {
    return (
      <Card tone="yellow" kicker={t("ml.act.pressStop")} title={live.currentRideLeg?.alight.name}>
        <button
          type="button"
          onClick={onImOff}
          className={BTN}
          style={{ background: "var(--r-char)", color: "#fff" }}
        >
          {t("ml.act.imOff")}
          <Icon name="map-pin-simple" size={16} />
        </button>
      </Card>
    );
  }

  if (live.phase === "walking-to-destination") {
    const walkMin = Math.max(
      0,
      Math.round((live.currentLeg?.kind === "walk" ? live.currentLeg.durationSec : 0) / 60),
    );
    return (
      <Card
        kicker={t("ml.act.finalLabel", { m: walkMin })}
        title={t("ml.act.finalTitle", { name: active.to.label })}
        body={t("ml.act.finalBody")}
      >
        <button
          type="button"
          onClick={() => multiLegMarkArrived()}
          className={BTN}
          style={{ background: "var(--r-char)", color: "#fff" }}
        >
          {t("ml.act.imHere")}
          <Icon name="map-pin-simple" size={16} />
        </button>
      </Card>
    );
  }

  if (live.phase === "arrived") {
    return (
      <Card kicker={t("hud.arrived.label")} title={t("hud.arrived.title", { name: active.to.label })}>
        <button
          type="button"
          onClick={() => {
            clearActiveTrip();
            void navigate({ to: "/" });
          }}
          className={BTN}
          style={{ background: "var(--r-char)", color: "#fff" }}
        >
          {t("hud.arrived.done")}
        </button>
      </Card>
    );
  }

  // Other phases: a calm "we've got you" line.
  return (
    <p className="r-pill r-pill--w" style={{ height: 40, padding: "0 16px" }}>
      <span className="r-dot r-live-pulse" />
      {t("ml.tracking")}
    </p>
  );
}
