// Mounted once inside __root. Redirects first-time riders to /welcome.
// Exempts routes that should remain reachable without onboarding: the
// welcome flow itself, legal pages, auth, checkout return, and the
// realtime/cron API surface.

import { useEffect } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/useAuth";
import { fetchOnboardedAt, isOnboardedCached } from "@/lib/onboarding";

const EXEMPT_PREFIXES = ["/welcome", "/privacy", "/terms", "/auth", "/api", "/checkout"];

export function OnboardingGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading || !user) return;
    if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return;
    if (pathname !== "/") return; // only intercept the home landing
    // Skip on the marketing domain — "/" there is the landing page, not the app.
    if (typeof window !== "undefined") {
      const h = window.location.hostname.toLowerCase();
      if (h === "aloya.cy" || h === "www.aloya.cy") return;
      if (h === "aloya.cy" || h === "www.aloya.cy") return;
    }
    const cached = isOnboardedCached();
    if (cached === true) return;
    if (cached === false) {
      void router.navigate({ to: "/welcome" });
      return;
    }
    let cancelled = false;
    void fetchOnboardedAt(user.id).then((done) => {
      if (!cancelled && !done) void router.navigate({ to: "/welcome" });
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user, pathname, router]);

  return null;
}
