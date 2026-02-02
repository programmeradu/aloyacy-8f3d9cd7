import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { registerServiceWorker } from "@/lib/pwa";
import { speak } from "@/lib/speech";
import { Toaster } from "@/components/ui/sonner";
import { useUserDataRealtime } from "@/lib/useUserDataRealtime";
import { bootstrapAnonymousAuth } from "@/lib/anon-auth";
import { startCloudSync } from "@/lib/cloud-sync";
import { useAuth } from "@/lib/useAuth";
import { OnboardingGate } from "@/components/OnboardingGate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#f5efe0" },
      { name: "google-site-verification", content: "GcixyHvy5nVekOttajeEqgILXPmlLunXElZbn10tK2I" },
      { title: "Aloya — Cyprus transit, beautifully" },
      { name: "description", content: "A calm, intelligent navigation system for Cyprus buses." },
      { property: "og:site_name", content: "Aloya" },
      { property: "og:locale", content: "en" },
      { property: "og:locale:alternate", content: "el" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Aloya — Cyprus transit, beautifully" },
      { property: "og:description", content: "A calm, intelligent navigation system for Cyprus buses." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Aloya — Cyprus transit, beautifully" },
      { name: "twitter:description", content: "A calm, intelligent navigation system for Cyprus buses." },
      // og:image is set per-route at leaf level so the hero of each page becomes its share image.
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://aloyacy.live/#organization",
              name: "Aloya",
              url: "https://aloyacy.live/",
              logo: "https://aloyacy.live/icon-512.png",
              description: "A calm, intelligent navigation system for Cyprus buses.",
              areaServed: { "@type": "Country", name: "Cyprus" },
            },
            {
              "@type": "WebSite",
              "@id": "https://aloyacy.live/#website",
              url: "https://aloyacy.live/",
              name: "Aloya",
              publisher: { "@id": "https://aloyacy.live/#organization" },
              inLanguage: ["en", "el"],
            },
            {
              "@type": "TransitAgency",
              "@id": "https://aloyacy.live/#transitagency",
              name: "Aloya",
              url: "https://aloyacy.live/",
              logo: "https://aloyacy.live/icon-512.png",
              description: "Unified live bus information, planning and ticketing across Cyprus — covering OSEL (Nicosia), EMEL (Limassol), Zenon (Larnaca), OSYPA (Paphos) and Intercity services.",
              areaServed: { "@type": "Country", name: "Cyprus" },
              sameAs: [
                "https://motionbuscard.org.cy/",
              ],
            },
            {
              "@type": "MobileApplication",
              name: "Aloya",
              operatingSystem: "Web, iOS, Android",
              applicationCategory: "TravelApplication",
              url: "https://aloyacy.live/",
              description: "Plan, track and ride Cyprus buses with live ETAs, nearby stops, and smart routing.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    void registerServiceWorker();
    void bootstrapAnonymousAuth();
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; text?: string } | null;
      if (data?.type === "aloya-speak" && data.text) speak(data.text);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeBridge />
      <CloudSyncBridge />
      <OnboardingGate />
      <Outlet />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}

// Lives inside QueryClientProvider so it can grab the queryClient via hook.
function RealtimeBridge() {
  useUserDataRealtime();
  return null;
}

// Pulls + pushes user-scoped data once we have a session (anonymous or linked).
function CloudSyncBridge() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    return startCloudSync(user.id);
  }, [user]);
  return null;
}
