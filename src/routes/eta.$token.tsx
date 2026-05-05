// Public "watch my ETA" view — friends open this from a shared link
// (`/eta/:token`) to see where a rider is right now and when they'll
// arrive. No account, no install. Read-only.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPreview } from "@/components/MapPreview";

type SharedTripRow = {
  token: string;
  origin_label: string | null;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  last_lat: number | null;
  last_lng: number | null;
  last_updated: string | null;
  eta_minutes: number | null;
  status: string;
  created_at: string;
  expires_at: string;
};

export const Route = createFileRoute("/eta/$token")({
  head: () => {
    const title = "Live ETA — Aloya";
    const desc = "Watch a friend's live bus trip across Cyprus.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
    };
  },
  component: EtaWatchPage,
});

function EtaWatchPage() {
  const { token } = Route.useParams();

  const query = useQuery({
    queryKey: ["shared-trip", token],
    queryFn: async (): Promise<SharedTripRow | null> => {
      const { data, error } = await supabase
        .from("shared_trips")
        .select("*")
        .eq("token", token)
        .maybeSingle();
      if (error) throw error;
      return (data as SharedTripRow | null) ?? null;
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const trip = query.data;

  if (query.isLoading) {
    return <Shell><Placeholder title="Loading trip…" /></Shell>;
  }
  if (query.isError) {
    return <Shell><Placeholder title="Couldn't load this trip" body="Check the link and try again." /></Shell>;
  }
  if (!trip) {
    return (
      <Shell>
        <Placeholder
          title="Link expired"
          body="This share link is no longer active. Ask your friend to send a new one."
        />
      </Shell>
    );
  }

  return <Shell><LiveView trip={trip} /></Shell>;
}

function LiveView({ trip }: { trip: SharedTripRow }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const hasFix = trip.last_lat != null && trip.last_lng != null;
  const lastUpdateSec = trip.last_updated
    ? Math.max(0, Math.round((now - new Date(trip.last_updated).getTime()) / 1000))
    : null;
  const expired = new Date(trip.expires_at).getTime() < now || trip.status === "ended";
  const staleFeed = lastUpdateSec != null && lastUpdateSec > 90;

  const markers = useMemo(() => {
    const list: { lat: number; lng: number; label: string; kind: "pin" | "destination"; tone?: "aegean" | "ochre" }[] = [
      {
        lat: trip.destination_lat,
        lng: trip.destination_lng,
        label: trip.destination_label,
        kind: "destination",
        tone: "ochre",
      },
    ];
    if (hasFix) {
      list.push({
        lat: trip.last_lat!,
        lng: trip.last_lng!,
        label: "Rider",
        kind: "pin",
        tone: "aegean",
      });
    }
    return list;
  }, [trip, hasFix]);

  const center = hasFix
    ? { lat: (trip.last_lat! + trip.destination_lat) / 2, lng: (trip.last_lng! + trip.destination_lng) / 2 }
    : { lat: trip.destination_lat, lng: trip.destination_lng };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-6">
      <header className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
          Live ETA
        </p>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
          {expired ? "ended" : staleFeed ? "reconnecting" : "live"}
        </p>
      </header>

      <div className="rounded-3xl bg-card p-5 ring-1 ring-line">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Heading to
        </p>
        <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
          {trip.destination_label}
        </h1>
        {trip.origin_label && (
          <p className="mt-2 font-sans text-[13px] font-medium text-ink-soft">
            From {trip.origin_label}
          </p>
        )}

        <div className="mt-4 flex items-baseline gap-3">
          {expired ? (
            <span className="font-display text-[36px] font-semibold text-ink">Arrived</span>
          ) : trip.eta_minutes != null ? (
            <>
              <span className="font-mono text-[46px] font-semibold leading-none tabular-nums text-ink">
                {trip.eta_minutes}
              </span>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
                min away
              </span>
            </>
          ) : (
            <span className="font-display text-[22px] font-semibold text-ink">
              En route
            </span>
          )}
        </div>

        {lastUpdateSec != null && !expired && (
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            Updated {lastUpdateSec < 60 ? `${lastUpdateSec}s` : `${Math.round(lastUpdateSec / 60)}m`} ago
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl ring-1 ring-line">
        <MapPreview
          height="360px"
          center={center}
          spanKm={hasFix ? undefined : 4}
          markers={markers}
        />
      </div>

      <footer className="mt-4 flex flex-col items-center gap-2 py-4">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
          Shared via Aloya
        </p>
        <a
          href="https://app.aloya.cy"
          className="font-sans text-[13px] font-semibold text-aegean-deep underline-offset-4 hover:underline"
        >
          Ride Cyprus with Aloya
        </a>
      </footer>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-limestone text-ink">{children}</main>;
}

function Placeholder({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
        Aloya
      </p>
      <h1 className="font-display text-[24px] font-semibold text-ink">{title}</h1>
      {body && <p className="font-sans text-[14px] font-medium text-ink-soft">{body}</p>}
      <a
        href="https://app.aloya.cy"
        className="mt-4 font-sans text-[13px] font-semibold text-aegean-deep underline-offset-4 hover:underline"
      >
        Open Aloya
      </a>
    </div>
  );
}
