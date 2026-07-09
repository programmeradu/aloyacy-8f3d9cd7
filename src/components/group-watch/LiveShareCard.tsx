// Active member controls: the geolocation watch that pings the group every
// ~25s, plus invite and leave.

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { leaveTripGroup, pingGroupMember } from "@/lib/trip-groups.functions";
import { MEMBER_TOKEN_KEY, PING_INTERVAL_MS, type GroupRow } from "./kit";
import { PulseDot } from "./chrome";

export function LiveShareCard({
  group,
  memberToken,
  onLeft,
}: {
  group: GroupRow;
  memberToken: string;
  onLeft: () => void;
}) {
  const ping = useServerFn(pingGroupMember);
  const leave = useServerFn(leaveTripGroup);
  const watchRef = useRef<number | null>(null);
  const lastPingRef = useRef(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    if (watchRef.current != null) return;
    const token = memberToken;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPingRef.current < PING_INTERVAL_MS) return;
        lastPingRef.current = now;
        void ping({
          data: {
            memberToken: token,
            position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          },
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => {
      if (watchRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [ping, memberToken]);

  const onLeave = useCallback(async () => {
    setBusy(true);
    try {
      await leave({ data: { memberToken } }).catch(() => {});
      try {
        localStorage.removeItem(MEMBER_TOKEN_KEY(group.code));
      } catch {
        /* ignore */
      }
      if (
        watchRef.current != null &&
        typeof navigator !== "undefined" &&
        "geolocation" in navigator
      ) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      onLeft();
    } finally {
      setBusy(false);
    }
  }, [leave, memberToken, group.code, onLeft]);

  const onShare = useCallback(async () => {
    const url = `${window.location.origin}/group/${group.code}`;
    const payload = {
      title: `Aloya group trip to ${group.destination_label}`,
      text: `Join me — we'll see each other converge on ${group.destination_label}.`,
      url,
    };
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share(payload);
        return;
      }
    } catch {
      /* sheet dismissed — fall back to the clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }, [group.code, group.destination_label]);

  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-line">
      <div className="flex items-center gap-2">
        <PulseDot />
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          You're sharing live
        </p>
      </div>
      <p className="mt-2 font-sans text-[13px] font-medium text-ink">
        Everyone in the group can see your position and ETA update every ~25 seconds. Keep this tab
        open — close it or tap Leave to stop sharing.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onShare}
          className="min-h-11 rounded-xl bg-aegean-deep px-4 py-2 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-limestone transition-opacity hover:opacity-90"
        >
          Invite more people
        </button>
        <button
          type="button"
          onClick={onLeave}
          disabled={busy}
          className="min-h-11 rounded-xl bg-ink/5 px-4 py-2 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink/10 disabled:opacity-60"
        >
          {busy ? "Leaving…" : "Leave group"}
        </button>
      </div>
    </div>
  );
}
