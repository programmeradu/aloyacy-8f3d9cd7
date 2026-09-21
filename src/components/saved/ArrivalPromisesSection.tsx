import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  listArrivalPromises,
  cancelArrivalPromise,
  refreshArrivalPromise,
  type ArrivalPromiseRow,
} from "@/lib/arrival-promise.functions";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useAuth } from "@/lib/useAuth";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowUpRight, IconClock } from "@/components/Icons";

export function ArrivalPromisesSection() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const fetchList = useServerFn(listArrivalPromises);
  const cancelFn = useServerFn(cancelArrivalPromise);
  const refreshFn = useServerFn(refreshArrivalPromise);
  const navigate = useNavigate();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const { data: promises = [], refetch } = useQuery({
    queryKey: ["arrival-promises"],
    queryFn: () => (user && isOnline ? fetchList() : []),
    enabled: !!user && isOnline,
    refetchInterval: isOnline ? 25_000 : false,
  });

  const nowUnix = Math.floor(Date.now() / 1000);
  const activePromises = promises.filter((p) => {
    if (p.status === "cancelled" || p.status === "done") return false;
    // Keep watching/leave-now/missed up to 30 mins past target arrival
    return p.target_arrival_unix > nowUnix - 30 * 60;
  });

  if (activePromises.length === 0) return null;

  return (
    <section className="mb-4 px-6 animate-rise" style={{ animationDelay: "40ms" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl text-ink">Arrival Promises</h2>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aegean opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-aegean-deep" />
          </span>
        </div>
        <span className="rounded-full bg-aegean-soft/70 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-aegean-deep">
          {activePromises.length} active
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {activePromises.map((p) => {
          const firstRide = p.plan_json?.legs?.find(
            (l) => l.kind === "ride" && l.routeShort,
          );
          const routeCode = firstRide?.kind === "ride" ? firstRide.routeShort : "PROMISE";
          const minsToLeave = Math.round((p.leave_by_unix - nowUnix) / 60);
          const isLeaveNow = p.status === "leave-now" || minsToLeave <= 0;
          const isMissed = p.status === "missed";
          const isRefreshing = refreshingId === p.id;

          const leaveTimeString = new Date(p.leave_by_unix * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const targetTimeString = new Date(p.target_arrival_unix * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          const bufferMins = Math.round((p.buffer_sec || 0) / 60);

          return (
            <div
              key={p.id}
              className={`flex flex-col gap-3 rounded-3xl p-5 ring-1 ring-line shadow-sm transition-all ${
                isMissed ? "bg-card/75 opacity-90" : "bg-card"
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <RouteChip code={routeCode} tone={isMissed ? "olive" : "aegean"} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-medium leading-tight text-ink truncate">
                      {p.destination_label || "Destination"}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft truncate">
                      Arrive by {targetTimeString} • from {p.origin_label || "Origin"}
                    </p>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium ${
                    isMissed
                      ? "bg-stone-100 text-ink-soft ring-1 ring-line dark:bg-stone-800"
                      : isLeaveNow
                        ? "bg-ochre-soft text-ochre font-semibold animate-pulse"
                        : minsToLeave <= 15
                          ? "bg-ochre-soft text-ochre font-semibold"
                          : "bg-aegean-soft text-aegean-deep font-semibold"
                  }`}
                >
                  {isMissed
                    ? "Missed"
                    : isLeaveNow
                      ? "Leave now"
                      : minsToLeave === 1
                        ? "Leave in 1 min"
                        : `Leave in ${minsToLeave} min`}
                </span>
              </div>

              {/* Dynamic Delay / Buffer callout */}
              <div className="flex flex-col gap-1 rounded-2xl bg-limestone-soft/80 p-3 ring-1 ring-line/50">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-sans font-medium text-ink flex items-center gap-1.5">
                    <IconClock className="size-3.5 text-aegean" />
                    Recommended departure:{" "}
                    <strong className="font-mono text-ink">{leaveTimeString}</strong>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                    {p.margin_pref} buffer
                  </span>
                </div>

                {bufferMins > 0 && (
                  <p className="text-[11px] text-ochre leading-relaxed">
                    ⚠️ +{bufferMins}m dynamic buffer added
                    {p.reason_short ? ` (${p.reason_short})` : ""}
                  </p>
                )}
              </div>

              {/* Footer row */}
              <div className="flex items-center justify-between pt-1 border-t border-line/60">
                <button
                  type="button"
                  onClick={async () => {
                    setRefreshingId(p.id);
                    try {
                      await refreshFn({ data: { id: p.id } });
                      await refetch();
                    } finally {
                      setRefreshingId(null);
                    }
                  }}
                  disabled={isRefreshing}
                  className="font-mono text-[11px] text-ink-soft hover:text-ink transition-colors flex items-center gap-1"
                >
                  <span className={isRefreshing ? "animate-spin inline-block" : ""}>↺</span>
                  {isRefreshing ? "Re-checking traffic..." : "Live traffic synced"}
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await cancelFn({ data: { id: p.id } });
                      refetch();
                    }}
                    className="rounded-full px-3 py-1 font-sans text-[11.5px] font-medium text-ink-soft hover:text-ink ring-1 ring-line hover:bg-limestone-soft transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set("fromLat", String(p.origin_lat));
                      params.set("fromLng", String(p.origin_lng));
                      params.set("fromLabel", p.origin_label);
                      params.set("toLat", String(p.destination_lat));
                      params.set("toLng", String(p.destination_lng));
                      params.set("toLabel", p.destination_label);
                      navigate({ to: `/trips?${params.toString()}` });
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-ink px-3.5 py-1 font-sans text-[11.5px] font-semibold text-limestone hover:bg-ink/90 shadow-sm transition-colors"
                  >
                    Start Trip
                    <IconArrowUpRight className="size-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
