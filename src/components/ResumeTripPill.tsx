import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useActiveTrip } from "@/lib/trip-store";
import { IconBus } from "./Icons";

/**
 * Persistent "Resume trip" affordance. Whenever the user has an active trip
 * stored locally but is NOT currently viewing it (e.g. they switched tabs,
 * minimised the PWA, or opened another section to look something up), a
 * compact pill appears just above the bottom nav so a single tap takes
 * them back to the live companion. Without this, the trip looks "lost"
 * even though it's still saved in localStorage.
 */
export function ResumeTripPill() {
  // Gate render until after hydration so the SSR pass (which has no
  // localStorage and therefore no trip) doesn't mismatch with the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = useActiveTrip();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!mounted || !active) return null;
  if (pathname.startsWith("/trip/")) return null;

  const bus = active.option.legs.find((l) => l.kind === "bus");
  const routeShort = bus && bus.kind === "bus" ? bus.routeShort : null;
  const destination = active.to.label;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[88px] z-30 flex justify-center px-4">
      <Link
        to="/trip/$id"
        params={{ id: active.option.id }}
        className="pointer-events-auto flex w-full max-w-[400px] items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-limestone shadow-[0_14px_40px_-18px_rgba(28,30,26,0.55)] ring-1 ring-ink/10 animate-rise"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-limestone/15">
          <IconBus className="size-4" />
        </span>
        <span className="flex flex-1 flex-col leading-tight text-left">
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-limestone/70">
            Trip in progress
          </span>
          <span className="text-[13px] font-medium truncate">
            {routeShort ? `Bus ${routeShort} — ` : ""}
            {destination}
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-limestone/80">
          Resume
        </span>
      </Link>
    </div>
  );
}
