// Group planning share view — /plan/:token.
//
// A friend opens the link before anyone leaves and sees the plan: where to
// meet, which bus to take, when it leaves, when the group arrives. Then
// they can open the same plan pre-filled in Aloya, or add it to their
// calendar. No install, no account.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPreview } from "@/components/MapPreview";

type Leg = {
  kind?: "ride" | "walk" | "wait";
  routeShort?: string;
  routeId?: string;
  board?: { name?: string; departureUnix?: number };
  alight?: { name?: string; arrivalUnix?: number };
  from?: { name?: string };
  to?: { name?: string };
  name?: string;
  durationSec?: number;
  stopCount?: number;
};

type PlanShare = {
  token: string;
  creator_name: string | null;
  note: string | null;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  departure_unix: number;
  arrival_unix: number;
  total_duration_sec: number;
  transfers: number;
  legs: Leg[];
  created_at: string;
  expires_at: string;
};

export const Route = createFileRoute("/plan/$token")({
  head: ({ params }) => {
    const token = String(params.token || "");
    const title = "A trip plan — Aloya";
    const desc = "Someone shared a Cyprus bus plan with you. Meeting point, bus, timing — open before you leave.";
    // Static branded PNG — SVG OG images are rejected by WhatsApp, iMessage,
    // Facebook, LinkedIn, Slack, and Twitter, so previews never render.
    // We serve a real PNG until a Worker-safe SVG→PNG rasterizer is wired up.
    const ogImage = "https://app.aloya.cy/og/plan-default.png";
    const pageUrl = `https://app.aloya.cy/plan/${encodeURIComponent(token)}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: pageUrl },
        { property: "og:image", content: ogImage },
        { property: "og:image:secure_url", content: ogImage },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:alt", content: "Shared trip plan preview — from, to, departure, bus and journey" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: ogImage },

      ],
    };
  },
  component: PlanSharePage,
});


function fmtTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
function fmtDur(sec: number) {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}`;
}

function PlanSharePage() {
  const { token } = Route.useParams();

  const q = useQuery({
    queryKey: ["plan-share", token],
    queryFn: async (): Promise<PlanShare | null> => {
      const res = await fetch(`/api/public/plan-share?token=${encodeURIComponent(token)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`plan-share ${res.status}`);
      return (await res.json()) as PlanShare;
    },
  });

  if (q.isLoading) return <Shell><Placeholder title="Loading plan…" /></Shell>;
  if (q.isError)
    return (
      <Shell>
        <Placeholder title="Couldn't load this plan" body="Check the link and try again." />
      </Shell>
    );
  if (!q.data)
    return (
      <Shell>
        <Placeholder
          title="Link expired"
          body="This plan is no longer active. Ask the person who sent it for a new link."
        />
      </Shell>
    );

  return <Shell><PlanView plan={q.data} /></Shell>;
}

function PlanView({ plan }: { plan: PlanShare }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 30_000);
    return () => clearInterval(t);
  }, []);

  const minsToDeparture = Math.round((plan.departure_unix - now) / 60);
  const isPast = plan.departure_unix < now - 60;
  const rides = plan.legs.filter((l) => l.kind === "ride");
  const firstRide = rides[0];
  const boardStop = firstRide?.board?.name ?? plan.origin_label;

  const openInAloyaHref = useMemo(() => {
    const params = new URLSearchParams({
      fromLabel: plan.origin_label,
      fromLat: String(plan.origin_lat),
      fromLng: String(plan.origin_lng),
      toLabel: plan.destination_label,
      toLat: String(plan.destination_lat),
      toLng: String(plan.destination_lng),
      dep: String(plan.departure_unix),
    });
    return `/trips?${params.toString()}`;
  }, [plan]);

  const icsHref = useMemo(() => {
    const dt = (u: number) =>
      new Date(u * 1000)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    const desc = [
      `Meet at ${boardStop}`,
      firstRide?.routeShort ? `Take ${firstRide.routeShort} at ${fmtTime(plan.departure_unix)}` : "",
      `Arrive ${plan.destination_label} around ${fmtTime(plan.arrival_unix)}`,
      plan.note ? `\\n${plan.note}` : "",
    ]
      .filter(Boolean)
      .join("\\n");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Aloya//Trip plan//EN",
      "BEGIN:VEVENT",
      `UID:${plan.token}@aloya.cy`,
      `DTSTAMP:${dt(Math.floor(Date.now() / 1000))}`,
      `DTSTART:${dt(plan.departure_unix)}`,
      `DTEND:${dt(plan.arrival_unix)}`,
      `SUMMARY:Bus to ${plan.destination_label}`,
      `LOCATION:${boardStop}`,
      `DESCRIPTION:${desc}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  }, [plan, boardStop, firstRide]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-6">
      <header className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
          Trip plan
        </p>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
          {isPast ? "past" : plan.transfers === 0 ? "direct" : `${plan.transfers} change${plan.transfers > 1 ? "s" : ""}`}
        </p>
      </header>

      {/* Hero card — who, when, where */}
      <section className="rounded-[28px] bg-card p-5 ring-1 ring-line">
        {plan.creator_name && (
          <p className="font-sans text-[13px] font-semibold text-ink-soft">
            {plan.creator_name} shared a plan
          </p>
        )}
        <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink text-pretty">
          Meet at <span className="text-aegean-deep">{boardStop}</span>
        </h1>
        <p className="mt-2 font-sans text-[14px] font-medium text-ink">
          {fmtDate(plan.departure_unix)}
        </p>

        <div className="mt-4 flex items-baseline gap-3">
          <span className="font-display text-[46px] font-semibold leading-none tabular-nums text-ink">
            {fmtTime(plan.departure_unix)}
          </span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
            depart
          </span>
        </div>

        {!isPast && (
          <p className="mt-2 font-sans text-[13px] font-semibold text-ink-soft">
            {minsToDeparture > 60
              ? `In about ${Math.round(minsToDeparture / 60)}h ${minsToDeparture % 60}m`
              : minsToDeparture > 0
                ? `In about ${minsToDeparture} min`
                : "Departure time is now"}
          </p>
        )}

        {plan.note && (
          <div className="mt-4 rounded-2xl bg-limestone-soft/70 px-4 py-3 ring-1 ring-line/70">
            <p className="font-sans text-[13px] leading-snug text-ink">{plan.note}</p>
          </div>
        )}
      </section>

      {/* Route summary */}
      <section className="rounded-[28px] bg-card p-5 ring-1 ring-line">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          The ride
        </p>
        <div className="mt-3 space-y-3">
          {plan.legs.map((leg, i) => (
            <LegRow key={i} leg={leg} />
          ))}
        </div>

        <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
              Arrive
            </p>
            <p className="mt-1 font-display text-[22px] font-semibold text-ink tabular-nums">
              {fmtTime(plan.arrival_unix)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
              Total
            </p>
            <p className="mt-1 font-display text-[22px] font-semibold text-ink tabular-nums">
              {fmtDur(plan.total_duration_sec)}
            </p>
          </div>
        </div>
      </section>

      {/* Meeting-point map */}
      <div className="overflow-hidden rounded-[28px] ring-1 ring-line">
        <MapPreview
          height="240px"
          center={{ lat: plan.origin_lat, lng: plan.origin_lng }}
          spanKm={2}
          markers={[
            {
              lat: plan.origin_lat,
              lng: plan.origin_lng,
              label: boardStop,
              kind: "pin",
              tone: "aegean",
            },
            {
              lat: plan.destination_lat,
              lng: plan.destination_lng,
              label: plan.destination_label,
              kind: "destination",
              tone: "ochre",
            },
          ]}
          liveVehicles={false}
        />
      </div>

      {/* Actions */}
      <div className="mt-2 flex flex-col gap-2">
        <a
          href={openInAloyaHref}
          className="flex w-full items-center justify-center rounded-2xl bg-ink py-3.5 font-sans text-[15px] font-semibold text-limestone hover:bg-ink/90"
        >
          Open this plan in Aloya
        </a>
        <a
          href={icsHref}
          download={`aloya-trip-${plan.token}.ics`}
          className="flex w-full items-center justify-center rounded-2xl bg-limestone-soft py-3.5 font-sans text-[14px] font-semibold text-ink ring-1 ring-line hover:bg-limestone-soft/70"
        >
          Add to my calendar
        </a>
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

function LegRow({ leg }: { leg: Leg }) {
  if (leg.kind === "ride") {
    const dep = leg.board?.departureUnix ? fmtTime(leg.board.departureUnix) : "";
    const arr = leg.alight?.arrivalUnix ? fmtTime(leg.alight.arrivalUnix) : "";
    return (
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex min-w-[44px] items-center justify-center rounded-lg bg-aegean-deep px-2 py-1 font-mono text-[13px] font-bold text-limestone tabular-nums">
          {leg.routeShort ?? "—"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[14px] font-semibold text-ink text-pretty">
            {leg.board?.name?.split(",")[0] ?? ""}
            <span className="mx-1 text-ink-soft">→</span>
            {leg.alight?.name?.split(",")[0] ?? ""}
          </p>
          <p className="mt-0.5 font-sans text-[12px] font-semibold text-ink-soft tabular-nums">
            {dep} – {arr}
            {typeof leg.stopCount === "number" ? ` · ${leg.stopCount} stops` : ""}
          </p>
        </div>
      </div>
    );
  }
  if (leg.kind === "walk") {
    return (
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex min-w-[44px] items-center justify-center rounded-lg bg-limestone-soft px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
          Walk
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[13px] font-semibold text-ink">
            {leg.from?.name?.split(",")[0] ?? ""}
            <span className="mx-1 text-ink-soft">→</span>
            {leg.to?.name?.split(",")[0] ?? ""}
          </p>
          <p className="mt-0.5 font-sans text-[12px] font-semibold text-ink-soft tabular-nums">
            {leg.durationSec ? fmtDur(leg.durationSec) : ""}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex min-w-[44px] items-center justify-center rounded-lg bg-limestone-soft px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
        Wait
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[13px] font-semibold text-ink">
          at {leg.name?.split(",")[0] ?? ""}
        </p>
        <p className="mt-0.5 font-sans text-[12px] font-semibold text-ink-soft tabular-nums">
          {leg.durationSec ? fmtDur(leg.durationSec) : ""}
        </p>
      </div>
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
