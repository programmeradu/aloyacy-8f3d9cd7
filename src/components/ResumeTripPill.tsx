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
  const { t } = useI18n();

  const active = useActiveTrip();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const hidden = !mounted || !active || pathname.startsWith("/trip/") || pathname === "/";
  // Pages pad their content for the dock while it shows (see roam.css).
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("r-has-resume", !hidden);
    return () => el.classList.remove("r-has-resume");
  }, [hidden]);
  // Now shows the trip in its own layout, above the stop card.
  if (hidden || !active) return null;

  const bus = active.option.legs.find((l) => l.kind === "bus");
  const routeShort = bus && bus.kind === "bus" ? bus.routeShort : null;
  const destination = active.to.label;

  return (
    <div
      className="roam pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4"
      style={{ bottom: "calc(max(var(--r-safe-bottom), 14px) + 80px)" }}
    >
      <Link
        to="/trip/$id"
        params={{ id: active.option.id }}
        className="r-resume pointer-events-auto"
      >
        <span className="r-resume-ic" aria-hidden="true">
          <IconBus className="size-4" />
          <span className="r-resume-dot" />
        </span>
        <span className="flex flex-1 flex-col leading-tight text-left min-w-0">
          <span className="text-[12px] font-medium" style={{ color: "var(--r-onchar-mute)" }}>
            {t("resume.label")}
          </span>
          <span className="text-[15px] font-medium truncate">
            {routeShort ? (
              <>
                <span style={{ color: "var(--r-y)" }}>
                  {t("resume.busTo", { code: routeShort })}
                </span>{" "}
                {destination}
              </>
            ) : (
              destination
            )}
          </span>
        </span>
        <span className="r-resume-cta">
          {t("resume.cta")}
          <svg
            viewBox="0 0 12 12"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h6M7 3l3 3-3 3" />
          </svg>
        </span>
      </Link>
    </div>
  );
}
