import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowUpRight } from "@/components/Icons";
import {
  listScheduledDepartures,
  cancelScheduledDeparture,
} from "@/lib/scheduled-departures.functions";
import { useAuth } from "@/lib/useAuth";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export function ScheduledDeparturesSection() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const fetchList = useServerFn(listScheduledDepartures);
  const cancelFn = useServerFn(cancelScheduledDeparture);
  const navigate = useNavigate();

  const { data: departures = [], refetch } = useQuery({
    queryKey: ["scheduled-departures"],
    queryFn: () => (user && isOnline ? fetchList() : []),
    enabled: !!user && isOnline,
    refetchInterval: isOnline ? 30_000 : false,
  });

  const nowUnix = Math.floor(Date.now() / 1000);
  const activeDepartures = departures.filter((d) => {
    if (d.status !== "scheduled") return false;
    const plan = (d.plan_json ?? {}) as Record<string, any>;
    const leaveByUnix = plan.leaveByUnix ?? d.remind_at_unix + 5 * 60;
    // Auto-archive trips older than 45 mins past departure or where arrival has passed
    return d.arrive_by_unix > nowUnix && leaveByUnix > nowUnix - 45 * 60;
  });

  if (activeDepartures.length === 0) return null;

  return (
    <section className="mb-4 px-6 animate-rise" style={{ animationDelay: "60ms" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">Trip Reminders</h2>
        <span className="rounded-full bg-aegean-soft/70 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-aegean-deep">
          {activeDepartures.length} scheduled
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {activeDepartures.map((d) => {
          const plan = (d.plan_json ?? {}) as Record<string, any>;
          const firstRide = plan.legs?.find((l: any) => l.kind === "ride" && l.routeShort);
          const routeCode = firstRide?.routeShort ?? "BUS";
          const leaveByUnix = plan.leaveByUnix ?? d.remind_at_unix + 5 * 60;
          const minsToLeave = Math.round((leaveByUnix - nowUnix) / 60);
          const isDeparted = minsToLeave < -5;
          const isLeaveNow = !isDeparted && minsToLeave <= 0;
          const adj = plan.adjustment;

          const leaveTimeString = new Date(leaveByUnix * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <div
              key={d.id}
              className={`flex flex-col gap-3 rounded-3xl p-5 ring-1 ring-line shadow-sm transition-all ${
                isDeparted ? "bg-card/75 opacity-90" : "bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <RouteChip code={routeCode} tone={isDeparted ? "olive" : "aegean"} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-medium leading-tight text-ink truncate">
                      {plan.toLabel ?? "Destination"}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft truncate">
                      from {plan.fromLabel ?? "Origin"}
                    </p>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium ${
                    isDeparted
                      ? "bg-stone-100 text-ink-soft ring-1 ring-line dark:bg-stone-800"
                      : isLeaveNow
                        ? "bg-ochre-soft text-ochre font-semibold animate-pulse"
                        : minsToLeave <= 10
                          ? "bg-ochre-soft text-ochre font-semibold"
                          : "bg-limestone-soft text-ink-soft ring-1 ring-line"
                  }`}
                >
                  {isDeparted
                    ? `Departed ${Math.abs(minsToLeave)}m ago`
                    : isLeaveNow
                      ? "Leave now"
                      : minsToLeave === 1
                        ? "Leave in 1 min"
                        : `Leave in ${minsToLeave} min`}
                </span>
              </div>

              {adj?.reasonShort && !isDeparted && (
                <div className="rounded-xl bg-ochre-soft/50 px-3 py-1.5 text-[11px] text-ink-soft truncate">
                  ⚠️ {adj.reasonShort} (+{Math.round(adj.extraSec / 60)}m buffer added)
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-line/60">
                <span className="font-mono text-[11px] text-ink-soft truncate mr-2">
                  {isDeparted ? "Missed this departure?" : `Depart by ${leaveTimeString}`}
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      await cancelFn({ data: { id: d.id } });
                      refetch();
                    }}
                    className="rounded-full px-3 py-1 font-sans text-[11.5px] font-medium text-ink-soft hover:text-ink ring-1 ring-line hover:bg-limestone-soft transition-colors"
                  >
                    {isDeparted ? "Dismiss" : "Cancel"}
                  </button>
                  <button
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (plan.fromLat != null) params.set("fromLat", String(plan.fromLat));
                      if (plan.fromLng != null) params.set("fromLng", String(plan.fromLng));
                      if (plan.fromLabel) params.set("fromLabel", plan.fromLabel);
                      if (plan.toLat != null) params.set("toLat", String(plan.toLat));
                      if (plan.toLng != null) params.set("toLng", String(plan.toLng));
                      if (plan.toLabel) params.set("toLabel", plan.toLabel);
                      navigate({ to: `/trips?${params.toString()}` });
                    }}
                    className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1 font-sans text-[11.5px] font-semibold shadow-sm transition-colors ${
                      isDeparted
                        ? "bg-aegean text-white hover:bg-aegean/90"
                        : "bg-ink text-limestone hover:bg-ink/90"
                    }`}
                  >
                    {isDeparted ? "Re-plan next bus" : "Start Trip"}
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
