// "I see this bus" — rider-confirmed sighting CTA.
//
// Shown next to a ghost-tier departure so the rider standing at the stop
// can rescue the trip from "no GPS" by physically confirming the bus is
// there. One tap → POST /api/public/sighting → snapshot folds it in on
// the next 20-second refresh and every rider sees `rider-confirmed`.
//
// Design notes:
//  - Tap target is a full 44px row so it works one-handed on mobile.
//  - We use the stop's coordinates, not the device GPS, so it works
//    instantly without a permission prompt — the user IS at the stop
//    they're viewing.
//  - After submit, the button enters a "thanks" state and is disabled
//    for the local cooldown (the server enforces a stricter rate limit).
//  - localStorage cooldown survives page reloads so spamming the page
//    doesn't replay the confirmation UI.

import { useEffect, useState } from "react";
import { getDeviceId } from "@/lib/pwa";
import { useI18n } from "@/lib/i18n";

const COOLDOWN_MS = 60_000;
const STORAGE_PREFIX = "aloya.sighting.";

function lastConfirmedAt(tripId: string): number {
  if (typeof localStorage === "undefined") return 0;
  const v = localStorage.getItem(STORAGE_PREFIX + tripId);
  return v ? Number(v) || 0 : 0;
}

function markConfirmed(tripId: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + tripId, String(Date.now()));
  } catch {
    // private mode — non-fatal, server rate limit still protects us.
  }
}

export type SightingButtonProps = {
  tripId: string;
  routeId?: string;
  stopId?: string;
  /** Stop coordinates — used as the sighting's lat/lng (no GPS prompt). */
  lat: number;
  lng: number;
};

export function SightingButton({
  tripId,
  routeId,
  stopId,
  lat,
  lng,
}: SightingButtonProps) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // Hydrate cooldown from localStorage on mount.
  useEffect(() => {
    const last = lastConfirmedAt(tripId);
    if (!last) return;
    const left = Math.max(0, COOLDOWN_MS - (Date.now() - last));
    if (left > 0) {
      setJustConfirmed(true);
      setCooldownLeft(left);
    }
  }, [tripId]);

  // Tick down cooldown.
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = window.setTimeout(() => {
      const left = Math.max(0, cooldownLeft - 1000);
      setCooldownLeft(left);
      if (left === 0) setJustConfirmed(false);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [cooldownLeft]);

  async function onConfirm(e: React.MouseEvent | React.PointerEvent) {
    // Stop propagation so we don't navigate when the button lives inside a Link.
    e.preventDefault();
    e.stopPropagation();
    if (submitting || justConfirmed) return;
    setSubmitting(true);
    try {
      await fetch("/api/public/sighting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: getDeviceId(),
          tripId,
          routeId,
          stopId,
          lat,
          lng,
        }),
        keepalive: true,
      });
      markConfirmed(tripId);
      setJustConfirmed(true);
      setCooldownLeft(COOLDOWN_MS);
    } catch {
      // Soft failure — let the rider tap again. We deliberately don't
      // show a toast: the silent retry path is fine UX for this affordance.
    } finally {
      setSubmitting(false);
    }
  }

  if (justConfirmed) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-2xl bg-aegean-soft/50 ring-1 ring-aegean/25 px-4 py-3"
      >
        <span
          aria-hidden
          className="mt-1 size-2 rounded-full bg-aegean-deep"
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-aegean-deep">
            {t("sighting.thanksLabel")}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
            {t("sighting.thanksDetail")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={submitting}
      className="group flex w-full items-start gap-3 rounded-2xl bg-card ring-1 ring-line px-4 py-3 text-left transition-all hover:ring-aegean/40 hover:-translate-y-px active:translate-y-0 disabled:opacity-60 disabled:pointer-events-none min-h-[44px]"
    >
      <span
        aria-hidden
        className="mt-1 size-2 rounded-full bg-ochre transition-colors group-hover:bg-aegean-deep"
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
          {t("sighting.kicker")}
        </p>
        <p className="mt-0.5 font-display text-[15px] leading-tight text-ink">
          {submitting ? t("sighting.sending") : t("sighting.cta")}
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft/80">
          {t("sighting.help")}
        </p>
      </div>
    </button>
  );
}
