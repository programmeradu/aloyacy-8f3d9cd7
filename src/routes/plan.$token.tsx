// Group planning share view — /plan/:token.
//
// A friend opens the link before anyone leaves and sees the plan: where to
// meet, which bus to take, when it leaves, when the group arrives. Then
// they can open the same plan pre-filled in Aloya, or add it to their
// calendar. No install, no account.

import { ogImage as ogUrl } from "@/lib/og-url";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPreview } from "@/components/MapPreview";
import { NotchCard } from "@/components/roam/NotchCard";
import { Icon } from "@/components/roam/Icon";
import { JLinePill } from "@/components/roam/journey/JourneyParts";
import { cleanName, clock, legColor, isPale } from "@/components/roam/journey/journey-model";

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
    const title = "A trip plan · Aloya";
    const desc =
      "Someone shared a Cyprus bus plan with you. Meeting point, bus, timing, open before you leave.";
    // Dynamic per-plan PNG (rasterized from our brand SVG on the Worker).
    // Minute-bucket cache-buster nudges platforms that key by URL to re-scrape.
    const bucket = Math.floor(Date.now() / 60_000);
    const ogImage = ogUrl(`/api/public/og/plan/${encodeURIComponent(token)}?v=${bucket}`);
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
        {
          property: "og:image:alt",
          content: "Shared trip plan preview, from, to, departure, bus and journey",
        },
        { property: "og:updated_time", content: String(bucket * 60) },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: ogImage },
      ],
    };
  },
  component: PlanSharePage,
});

const fmtTime = clock;
function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Nicosia",
  });
}
function fmtDur(sec: number) {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
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

  if (q.isLoading)
    return (
      <Shell>
        <Placeholder title="Loading plan…" />
      </Shell>
    );
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

  return (
    <Shell>
      <PlanView plan={q.data} />
    </Shell>
  );
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
      firstRide?.routeShort
        ? `Take ${firstRide.routeShort} at ${fmtTime(plan.departure_unix)}`
        : "",
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

  const changeLabel = isPast
    ? "Past plan"
    : plan.transfers === 0
      ? "Direct"
      : `${plan.transfers} change${plan.transfers > 1 ? "s" : ""}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-10 pt-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="r-t2">Trip plan</h1>
        <span className="r-pill r-pill--w r-tnum">{changeLabel}</span>
      </header>

      {/* Who, when, where */}
      <NotchCard
        fill="#262626"
        radius={28}
        shadow="drop-shadow(0 18px 30px rgba(0,0,0,.22))"
        className="text-white"
      >
        <div className="px-5 pb-6 pt-5">
          {plan.creator_name && (
            <p className="text-[14px]" style={{ color: "var(--r-onchar-mute)" }}>
              {plan.creator_name} shared a plan
            </p>
          )}
          <p className="mt-1 text-[14px]" style={{ color: "var(--r-onchar-mute)" }}>
            Meet at
          </p>
          <p className="mt-0.5 text-[26px] font-medium leading-tight" style={{ overflowWrap: "anywhere" }}>
            {cleanName(boardStop)}
          </p>
          <p className="mt-2 text-[14px]" style={{ color: "var(--r-onchar-mute)" }}>
            {fmtDate(plan.departure_unix)}
          </p>
          <div className="mt-4 flex items-end justify-between gap-3">
            <p className="r-tnum">
              <span className="r-jl-big">{fmtTime(plan.departure_unix)}</span>
            </p>
            {!isPast && (
              <span className="r-pill r-tnum" style={{ background: "#3b3b3b", color: "#fff" }}>
                <Icon name="clock" size={15} />
                {minsToDeparture > 60
                  ? `In ${Math.floor(minsToDeparture / 60)} h ${minsToDeparture % 60} min`
                  : minsToDeparture > 0
                    ? `In ${minsToDeparture} min`
                    : "Leaving now"}
              </span>
            )}
          </div>
          {plan.note && (
            <p
              className="mt-4 rounded-[18px] px-4 py-3 text-[14px] leading-snug"
              style={{ background: "#333" }}
            >
              {plan.note}
            </p>
          )}
        </div>
      </NotchCard>

      {/* The ride, leg by leg */}
      <section className="r-card" style={{ padding: "16px 16px 10px" }}>
        <p className="r-lbl">The ride</p>
        <div className="mt-3">
          <PlanLegs legs={plan.legs} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 border-t border-[var(--r-line)] pt-4 pb-2">
          <div>
            <p className="r-lbl">Arrive</p>
            <p className="mt-1 text-[24px] r-tnum">{fmtTime(plan.arrival_unix)}</p>
          </div>
          <div className="text-right">
            <p className="r-lbl">Door to door</p>
            <p className="mt-1 text-[24px] r-tnum">{fmtDur(plan.total_duration_sec)}</p>
          </div>
        </div>
      </section>

      {/* Meeting point map */}
      <MapPreview
        height="h-60"
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

      {/* Actions */}
      <div className="mt-1 flex flex-col gap-2">
        <a
          href={openInAloyaHref}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--r-char)] text-[15px] font-semibold text-white"
        >
          Open this plan in Aloya
          <Icon name="arrow-up-right" size={16} />
        </a>
        <a
          href={icsHref}
          download={`aloya-trip-${plan.token}.ics`}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold"
        >
          <Icon name="calendar-plus" size={17} />
          Add to my calendar
        </a>
      </div>

      <footer className="mt-4 flex flex-col items-center gap-1 py-2">
        <p className="r-lbl">Shared via Aloya</p>
        <a href="https://app.aloya.cy" className="text-[14px] font-semibold underline-offset-4 hover:underline">
          Ride Cyprus with Aloya
        </a>
      </footer>
    </div>
  );
}

/** Shared plan legs on the Roam itinerary rail: rides in line colour, a change block between rides. */
function PlanLegs({ legs }: { legs: Leg[] }) {
  const rideIdx = legs.map((l, i) => (l.kind === "ride" ? i : -1)).filter((i) => i >= 0);
  const out: React.ReactNode[] = [];
  legs.forEach((leg, i) => {
    if (leg.kind === "ride") {
      const c = legColor({ routeId: leg.routeId ?? "" });
      const st = { "--lc": c } as React.CSSProperties;
      const pale = isPale(c) ? " is-pale" : "";
      const dep = leg.board?.departureUnix ? fmtTime(leg.board.departureUnix) : "";
      const arr = leg.alight?.arrivalUnix ? fmtTime(leg.alight.arrivalUnix) : "";
      out.push(
        <li key={`b${i}`} className="r-jl-row is-stop" style={st}>
          <span className="r-jl-time r-tnum">{dep}</span>
          <span className={`r-jl-rail is-top${pale}`}>
            <span className="r-jl-dot is-big" />
          </span>
          <span className="r-jl-body">
            <span className="r-jl-k">Get on</span>
            <span className="r-jl-name">{cleanName(leg.board?.name)}</span>
          </span>
        </li>,
        <li key={`r${i}`} className="r-jl-row is-ride" style={st}>
          <span className="r-jl-time" />
          <span className={`r-jl-rail${pale}`} />
          <span className="r-jl-body">
            <span className="r-jl-ridecard">
              <JLinePill
                leg={{ routeId: leg.routeId ?? "", routeShort: leg.routeShort ?? "", routeLong: "" }}
              />
              {typeof leg.stopCount === "number" ? (
                <span className="r-jl-stopsline r-tnum">
                  {leg.stopCount === 1 ? "1 stop" : `${leg.stopCount} stops`}
                </span>
              ) : null}
            </span>
          </span>
        </li>,
        <li key={`a${i}`} className="r-jl-row is-stop" style={st}>
          <span className="r-jl-time r-tnum">{arr}</span>
          <span className={`r-jl-rail is-bottom${pale}`}>
            <span className="r-jl-dot is-big" />
          </span>
          <span className="r-jl-body">
            <span className="r-jl-k">Get off</span>
            <span className="r-jl-name">{cleanName(leg.alight?.name)}</span>
          </span>
        </li>,
      );
      return;
    }
    const between = rideIdx.some((r) => r < i) && rideIdx.some((r) => r > i);
    if (between) {
      // Change: render once, at the first non-ride leg after a ride.
      if (legs[i - 1]?.kind !== "ride") return;
      const next = legs.slice(i).find((l) => l.kind === "ride");
      const gap = legs.slice(i, legs.indexOf(next as Leg));
      const walkSec = gap.filter((l) => l.kind === "walk").reduce((n, l) => n + (l.durationSec ?? 0), 0);
      const waitSec = gap.filter((l) => l.kind === "wait").reduce((n, l) => n + (l.durationSec ?? 0), 0);
      out.push(
        <li key={`c${i}`} className="r-jl-row is-change">
          <span className="r-jl-time" />
          <span className="r-jl-rail is-walk" />
          <span className="r-jl-body">
            <span className="r-jl-change">
              <span className="r-jl-change-head">
                <span className="r-jl-change-ic" aria-hidden="true">
                  <Icon name="arrows-left-right" size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="r-jl-change-k">Change</span>
                  <span className="r-jl-change-t">Change at {cleanName(next?.board?.name)}</span>
                </span>
              </span>
              <span className="r-jl-change-facts r-tnum">
                <span className="r-jl-fact">
                  <Icon name={walkSec > 30 ? "person-simple-walk" : "map-pin-simple"} size={15} />
                  {walkSec > 30 ? `${Math.max(1, Math.round(walkSec / 60))} min walk` : "Same stop"}
                </span>
                <span className="r-jl-fact">
                  <Icon name="clock" size={15} />
                  {waitSec >= 60 ? `${Math.round(waitSec / 60)} min wait` : "Connects straight away"}
                </span>
              </span>
            </span>
          </span>
        </li>,
      );
      return;
    }
    if (leg.kind === "walk" && (leg.durationSec ?? 0) >= 30) {
      out.push(
        <li key={`w${i}`} className="r-jl-row is-walkrow">
          <span className="r-jl-time" />
          <span className="r-jl-rail is-walk" />
          <span className="r-jl-body">
            <span className="r-jl-walk r-tnum">
              <Icon name="person-simple-walk" size={15} />
              {`${Math.max(1, Math.round((leg.durationSec ?? 0) / 60))} min walk to ${cleanName(leg.to?.name)}`}
            </span>
          </span>
        </li>,
      );
    } else if (leg.kind === "wait" && (leg.durationSec ?? 0) >= 60) {
      out.push(
        <li key={`t${i}`} className="r-jl-row is-walkrow">
          <span className="r-jl-time" />
          <span className="r-jl-rail is-walk" />
          <span className="r-jl-body">
            <span className="r-jl-walk r-tnum">
              <Icon name="clock" size={15} />
              {`${Math.round((leg.durationSec ?? 0) / 60)} min wait at ${cleanName(leg.name)}`}
            </span>
          </span>
        </li>,
      );
    }
  });
  return <ol className="r-jl">{out}</ol>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="roam r-page min-h-dvh">{children}</main>;
}

function Placeholder({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="r-lbl">Aloya</p>
      <h1 className="r-t2">{title}</h1>
      {body && <p className="text-[15px] text-[var(--r-ink2)]">{body}</p>}
      <a
        href="https://app.aloya.cy"
        className="mt-4 inline-flex h-11 items-center rounded-full bg-[var(--r-char)] px-5 text-[15px] font-semibold text-white"
      >
        Open Aloya
      </a>
    </div>
  );
}
