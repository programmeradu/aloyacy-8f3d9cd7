import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useActiveTrip } from "@/lib/trip-store";
import { useI18n } from "@/lib/i18n";
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
        className="pointer-events-auto group flex w-full max-w-[400px] items-center gap-3 rounded-full bg-ink px-3.5 py-2.5 text-limestone shadow-[0_18px_44px_-18px_rgba(28,30,26,0.6)] ring-1 ring-ink/10 animate-rise"
      >
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-aegean-deep">
          <IconBus className="size-4 text-limestone" />
          <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ochre opacity-70" />
            <span className="relative inline-flex size-2.5 rounded-full bg-ochre ring-2 ring-ink" />
          </span>
        </span>
        <span className="flex flex-1 flex-col leading-tight text-left min-w-0">
          <span className="font-sans text-[11px] font-semibold tracking-wide text-limestone/70">
            Trip in progress
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight truncate">
            {routeShort ? (
              <>
                <span className="text-ochre">Bus {routeShort}</span>
                <span className="text-limestone/60"> to </span>
                {destination}
              </>
            ) : (
              destination
            )}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-limestone px-3 py-1.5 font-sans text-[12px] font-semibold text-ink">
          Resume
          <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h6M7 3l3 3-3 3" /></svg>
        </span>
      </Link>
    </div>
  );
}
