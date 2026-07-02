// Public "group trip" watch page — everyone converging on one destination
// sees each other on a single map with live ETAs. No account required to
// watch; joining just needs a display name + browser geolocation.
//
// Identity model (plain-language, for the reviewer):
//  - Every browser that opens this link gets its own persisted `memberToken`
//    (stored per-group in localStorage). Different friends = different tokens
//    = different rows in `trip_group_members`, each with their own name,
//    color, live position and ETA.
//  - The host's token is minted when they create the group; visitors mint
//    theirs the moment they tap "Join this trip".
//  - The page tells the current viewer, up front, which member card is them.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { MapPreview } from "@/components/MapPreview";
import { pingGroupMember, joinTripGroup, leaveTripGroup } from "@/lib/trip-groups.functions";
import { useActiveTrip } from "@/lib/trip-store";
import heroArtAsset from "@/assets/group-converge-hero.jpg.asset.json";
const heroArt = heroArtAsset.url;

const MEMBER_TOKEN_KEY = (code: string) => `aloya.group.${code}.token`;
const PING_INTERVAL_MS = 25_000;

type GroupRow = {
  id: string;
  code: string;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  created_by_name: string | null;
  created_at: string;
  expires_at: string;
};

type MemberRow = {
  id: string;
  group_id: string;
  member_token: string;
  display_name: string;
  origin_label: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_updated: string | null;
  eta_minutes: number | null;
  status: string;
  is_creator: boolean;
  joined_at: string;
};

const MEMBER_TONES = ["aegean", "ochre", "olive", "ink"] as const;
type Tone = (typeof MEMBER_TONES)[number];

function toneClasses(tone: Tone) {
  switch (tone) {
    case "aegean":
      return { dot: "bg-aegean-deep", ring: "ring-aegean-deep/30", chip: "bg-aegean-soft/60 text-aegean-deep" };
    case "ochre":
      return { dot: "bg-ochre", ring: "ring-ochre/40", chip: "bg-ochre/15 text-[oklch(0.42_0.11_60)]" };
    case "olive":
      return { dot: "bg-olive", ring: "ring-olive/40", chip: "bg-olive/15 text-[oklch(0.38_0.06_120)]" };
    case "ink":
    default:
      return { dot: "bg-ink", ring: "ring-ink/30", chip: "bg-ink/10 text-ink" };
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

export const Route = createFileRoute("/group/$code")({
  head: ({ params }) => {
    const code = String(params.code || "").toUpperCase();
    const title = `Group trip · ${code} — Aloya`;
    const desc = "Everyone in your group, converging on one place. Live positions and arrival ETAs update as friends move.";
    // Absolute OG image URL is rendered on demand from the current group
    // state. A cache-buster minute-bucket nudges platforms that key by URL
    // to re-fetch periodically so previews don't stay stale for hours.
    const bucket = Math.floor(Date.now() / 60_000);
    const ogImage = `https://app.aloya.cy/api/public/og/group/${encodeURIComponent(code)}?v=${bucket}`;
    const pageUrl = `https://app.aloya.cy/group/${encodeURIComponent(code)}`;
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
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:type", content: "image/svg+xml" },
        { property: "og:image:alt", content: "Live group trip preview — destination, host, and joined members" },
        { property: "og:updated_time", content: String(bucket * 60) },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: ogImage },
      ],
    };
  },
  component: GroupWatchPage,
});


function GroupWatchPage() {
  const { code } = Route.useParams();
  const queryClient = useQueryClient();

  const groupQuery = useQuery({
    queryKey: ["trip-group", code],
    queryFn: async (): Promise<GroupRow | null> => {
      const { data, error } = await supabase
        .from("trip_groups")
        .select("*")
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (error) throw error;
      return (data as GroupRow | null) ?? null;
    },
  });

  const group = groupQuery.data ?? null;
  const groupId = group?.id;

  const membersQuery = useQuery({
    queryKey: ["trip-group-members", groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await supabase
        .from("trip_group_members")
        .select("*")
        .eq("group_id", groupId!)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data as MemberRow[]) ?? [];
    },
    refetchInterval: 20_000,
  });

  // Realtime — instant updates when anyone's ETA/position changes.
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`trip-group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_group_members", filter: `group_id=eq.${groupId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["trip-group-members", groupId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, queryClient]);

  // Current viewer's token → so we can highlight "this is you".
  const [myToken, setMyToken] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.localStorage.getItem(MEMBER_TOKEN_KEY(code.toUpperCase()));
    setMyToken(t);
  }, [code]);

  if (groupQuery.isLoading) return <Shell><LoadingState /></Shell>;
  if (groupQuery.isError || !group) {
    return (
      <Shell>
        <MissingState />
      </Shell>
    );
  }

  const expired = new Date(group.expires_at).getTime() < Date.now();
  const members = membersQuery.data ?? [];
  const orderedMembers = members;
  const meIndex = myToken ? orderedMembers.findIndex((m) => m.member_token === myToken) : -1;
  const me = meIndex >= 0 ? orderedMembers[meIndex] : null;

  return (
    <Shell>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <Hero group={group} members={orderedMembers} expired={expired} me={me} />

        <div className="flex flex-col gap-4 px-5 pb-10 pt-6">
          <IdentityRibbon
            me={me}
            meIndex={meIndex}
            hasToken={!!myToken}
            expired={expired}
            hostName={group.created_by_name}
          />
          <ConvergeCard members={orderedMembers} expired={expired} />
          <GroupMap group={group} members={orderedMembers} meToken={myToken} />
          {!expired && <PlanRouteCard group={group} joined={me != null} />}
          <MembersList members={orderedMembers} meToken={myToken} />
          {!expired && (me == null) && <JoinCard group={group} onJoined={setMyToken} />}
          {!expired && me != null && <LiveShareCard group={group} me={me} onLeft={() => setMyToken(null)} />}
          <HowThisWorks />
          <Footer code={group.code} />
        </div>

      </div>
    </Shell>
  );
}

/* ————————————————————————————————— Hero ————————————————————————————————— */

function Hero({
  group,
  members,
  expired,
  me,
}: {
  group: GroupRow;
  members: MemberRow[];
  expired: boolean;
  me: MemberRow | null;
}) {
  const active = members.filter((m) => m.status === "active").length;
  return (
    <header className="relative isolate overflow-hidden">
      <img
        src={heroArt}
        alt=""
        aria-hidden
        width={1600}
        height={960}
        className="absolute inset-0 h-full w-full object-cover opacity-90"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-limestone/10 via-limestone/40 to-limestone" />
      <div className="relative flex flex-col gap-6 px-5 pb-10 pt-10">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-ink">
            Aloya · Live group
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-limestone/90 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-ink ring-1 ring-line backdrop-blur">
            {expired ? "Ended" : <><PulseDot />&nbsp;Live · {group.code}</>}
          </span>
        </div>

        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
            Everyone converging on
          </p>
          <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[42px]">
            {group.destination_label}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AvatarStack members={members} />
          <p className="font-sans text-[13px] font-semibold text-ink">
            {active} {active === 1 ? "person" : "people"} on the way
            {group.created_by_name ? (
              <span className="font-medium text-ink-soft"> · hosted by {group.created_by_name}</span>
            ) : null}
            {me ? <span className="font-medium text-ink-soft"> · including you</span> : null}
          </p>
        </div>
      </div>
    </header>
  );
}

function AvatarStack({ members }: { members: MemberRow[] }) {
  const shown = members.slice(0, 5);
  const extra = Math.max(0, members.length - shown.length);
  return (
    <div className="flex -space-x-2">
      {shown.map((m, i) => {
        const tone = MEMBER_TONES[i % MEMBER_TONES.length];
        const t = toneClasses(tone);
        return (
          <span
            key={m.id}
            title={m.display_name}
            className={`inline-flex size-8 items-center justify-center rounded-full font-mono text-[11px] font-semibold uppercase tracking-wider ring-2 ring-limestone ${t.chip}`}
          >
            {initials(m.display_name)}
          </span>
        );
      })}
      {extra > 0 && (
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-semibold text-limestone ring-2 ring-limestone">
          +{extra}
        </span>
      )}
    </div>
  );
}

/* ————————————————————————— Identity ribbon ————————————————————————— */

function IdentityRibbon({
  me,
  meIndex,
  hasToken,
  expired,
  hostName,
}: {
  me: MemberRow | null;
  meIndex: number;
  hasToken: boolean;
  expired: boolean;
  hostName: string | null;
}) {
  if (expired) return null;
  if (me) {
    const tone = MEMBER_TONES[meIndex % MEMBER_TONES.length];
    const t = toneClasses(tone);
    return (
      <div className={`flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ${t.ring}`}>
        <span className={`inline-flex size-9 items-center justify-center rounded-full font-mono text-[12px] font-semibold uppercase ${t.chip}`}>
          {initials(me.display_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
            You appear as
          </p>
          <p className="truncate font-display text-[16px] font-semibold text-ink">
            {me.display_name}{me.is_creator ? " · host" : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-limestone-soft px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          <PulseDot />&nbsp;sharing
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
        You're watching as a guest
      </p>
      <p className="mt-1 font-sans text-[13px] font-medium text-ink">
        {hostName ? `${hostName} shared this trip with you.` : "Someone shared this trip with you."} Join below and everyone will see your ETA too — otherwise you'll just watch.
      </p>
      {hasToken && (
        <p className="mt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Previous session ended
        </p>
      )}
    </div>
  );
}

/* ————————————————————————————— Map ————————————————————————————— */

function GroupMap({
  group,
  members,
  meToken,
}: {
  group: GroupRow;
  members: MemberRow[];
  meToken: string | null;
}) {
  const markers = useMemo(() => {
    const list: {
      lat: number;
      lng: number;
      label: string;
      kind: "pin" | "destination";
      tone?: Tone;
    }[] = [
      {
        lat: group.destination_lat,
        lng: group.destination_lng,
        label: group.destination_label,
        kind: "destination",
        tone: "ochre",
      },
    ];
    members.forEach((m, i) => {
      if (m.status !== "active" || m.last_lat == null || m.last_lng == null) return;
      list.push({
        lat: m.last_lat,
        lng: m.last_lng,
        label: m.member_token === meToken ? `${m.display_name} (you)` : m.display_name,
        kind: "pin",
        tone: MEMBER_TONES[i % MEMBER_TONES.length],
      });
    });
    return list;
  }, [group, members, meToken]);

  const fixCount = markers.filter((m) => m.kind === "pin").length;
  const center = fixCount === 0
    ? { lat: group.destination_lat, lng: group.destination_lng }
    : undefined;

  return (
    <section className="relative overflow-hidden rounded-3xl ring-1 ring-line">
      <div className="pointer-events-none absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-limestone/90 px-3 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink ring-1 ring-line backdrop-blur">
        <PulseDot />&nbsp;Live map · {fixCount} sharing
      </div>
      <MapPreview
        height="h-[380px]"
        center={center}
        spanKm={fixCount === 0 ? 4 : undefined}
        markers={markers}
        liveVehicles={false}
      />
      {fixCount === 0 && (
        <p className="border-t border-line bg-card px-4 py-3 font-sans text-[12px] font-medium text-ink-soft">
          Waiting for the first person to start moving. Positions appear the moment someone joins and shares location.
        </p>
      )}
    </section>
  );
}

/* ——————————————————————— Members list ——————————————————————— */

function MembersList({ members, meToken }: { members: MemberRow[]; meToken: string | null }) {
  const now = Date.now();
  if (members.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-5 ring-1 ring-line">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          Nobody here yet
        </p>
        <p className="mt-1 font-sans text-[13px] font-medium text-ink">
          As friends open the link and join, they'll show up here with their live ETA.
        </p>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <p className="px-1 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
        The group
      </p>
      <ul className="flex flex-col gap-2">
        {members.map((m, i) => {
          const tone = MEMBER_TONES[i % MEMBER_TONES.length];
          const t = toneClasses(tone);
          const updatedSec = m.last_updated
            ? Math.max(0, Math.round((now - new Date(m.last_updated).getTime()) / 1000))
            : null;
          const stale = updatedSec != null && updatedSec > 120;
          const left = m.status !== "active";
          const isMe = m.member_token === meToken;
          return (
            <li
              key={m.id}
              className={`flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 transition-opacity ${
                isMe ? t.ring : "ring-line"
              } ${left ? "opacity-60" : ""}`}
            >
              <span className={`inline-flex size-10 items-center justify-center rounded-full font-mono text-[12px] font-semibold uppercase ${t.chip}`}>
                {initials(m.display_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
                  <span className="truncate">{m.display_name}</span>
                  {isMe && (
                    <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-limestone">
                      you
                    </span>
                  )}
                  {m.is_creator && !isMe && (
                    <span className="rounded-full bg-limestone-soft px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                      host
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-sans text-[12px] font-medium text-ink-soft">
                  {left
                    ? "Left the group"
                    : m.eta_minutes != null
                      ? `${m.eta_minutes} min away`
                      : m.last_lat != null
                        ? "En route"
                        : "Not yet moving"}
                  {updatedSec != null && !left && (
                    <>
                      {"  —  "}
                      {stale
                        ? "reconnecting"
                        : `updated ${updatedSec < 60 ? `${updatedSec}s` : `${Math.round(updatedSec / 60)}m`} ago`}
                    </>
                  )}
                </p>
              </div>
              {!left && !stale && <span className={`size-2 rounded-full ${t.dot} animate-pulse`} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* —————————————————— Converge / arrival summary —————————————————— */

function ConvergeCard({ members, expired }: { members: MemberRow[]; expired: boolean }) {
  const active = members.filter((m) => m.status === "active");
  const etas = active.map((m) => m.eta_minutes).filter((e): e is number => typeof e === "number");
  if (expired) {
    return (
      <div className="rounded-2xl bg-limestone-soft p-5 ring-1 ring-line">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          Group ended
        </p>
        <p className="mt-1 font-sans text-[13px] font-medium text-ink">
          Positions and ETAs stopped updating. Start a fresh group if you're heading out again.
        </p>
      </div>
    );
  }
  if (etas.length === 0) return null;
  const first = Math.min(...etas);
  const last = Math.max(...etas);
  const spread = last - first;
  const allTogether = spread <= 3;
  return (
    <div className="rounded-2xl bg-aegean-soft/40 p-5 ring-1 ring-aegean/20">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-aegean-deep">
        Arriving together
      </p>
      <p className="mt-1 font-display text-[24px] font-semibold leading-tight text-ink">
        {allTogether
          ? first === 0
            ? "Everyone's here."
            : `Everyone in ~${first} min.`
          : `First in ${first} min · last in ${last} min`}
      </p>
      <p className="mt-2 font-sans text-[13px] font-medium text-ink-soft">
        {allTogether
          ? spread === 0
            ? "Same minute across the group — perfect meet-up window."
            : `Spread of ${spread} min — you'll all land inside a coffee's wait.`
          : `${spread} min gap. The earliest can grab a table while the rest catch up.`}
      </p>
    </div>
  );
}

/* ——————————————————————— Join / Live share ——————————————————————— */

function JoinCard({ group, onJoined }: { group: GroupRow; onJoined: (token: string) => void }) {
  const join = useServerFn(joinTripGroup);
  const [name, setName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const readPosition = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8_000 },
      );
    });
  }, []);

  const onJoin = useCallback(async () => {
    setErr(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErr("Enter your name so the group knows who you are.");
      return;
    }
    setBusy(true);
    try {
      const origin = await readPosition();
      const res = await join({
        data: {
          code: group.code,
          displayName: trimmed.slice(0, 40),
          origin: origin ?? undefined,
        },
      });
      try {
        localStorage.setItem(MEMBER_TOKEN_KEY(group.code), res.memberToken);
      } catch { /* ignore */ }
      onJoined(res.memberToken);
    } catch {
      setErr("Couldn't join. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [name, group.code, readPosition, join, onJoined]);

  return (
    <div className="rounded-3xl bg-ink p-5 text-limestone ring-1 ring-ink">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-limestone/70">
        Join this trip
      </p>
      <h2 className="mt-1 font-display text-[22px] font-semibold leading-tight">
        Share your live ETA with the group
      </h2>
      <p className="mt-2 font-sans text-[13px] font-medium text-limestone/80">
        Enter your name and allow location. Everyone converging on {group.destination_label} will see you appear on the map with a live ETA.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          className="min-w-0 flex-1 rounded-xl bg-limestone/10 px-4 py-3 font-sans text-[14px] font-semibold text-limestone ring-1 ring-limestone/20 placeholder:text-limestone/50 focus:outline-none focus:ring-2 focus:ring-ochre/60"
        />
        <button
          type="button"
          onClick={onJoin}
          disabled={busy}
          className="rounded-xl bg-ochre px-5 py-3 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
      {err && (
        <p className="mt-2 font-sans text-[12px] font-semibold text-ochre">{err}</p>
      )}
      <p className="mt-3 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-limestone/60">
        Location shared only while this tab is open · leave any time
      </p>
    </div>
  );
}

function LiveShareCard({
  group,
  me,
  onLeft,
}: {
  group: GroupRow;
  me: MemberRow;
  onLeft: () => void;
}) {
  const ping = useServerFn(pingGroupMember);
  const leave = useServerFn(leaveTripGroup);
  const watchRef = useRef<number | null>(null);
  const lastPingRef = useRef(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    if (watchRef.current != null) return;
    const token = me.member_token;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPingRef.current < PING_INTERVAL_MS) return;
        lastPingRef.current = now;
        void ping({
          data: {
            memberToken: token,
            position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          },
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => {
      if (watchRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [ping, me.member_token]);

  const onLeave = useCallback(async () => {
    setBusy(true);
    try {
      await leave({ data: { memberToken: me.member_token } }).catch(() => {});
      try { localStorage.removeItem(MEMBER_TOKEN_KEY(group.code)); } catch { /* ignore */ }
      if (watchRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      onLeft();
    } finally {
      setBusy(false);
    }
  }, [leave, me.member_token, group.code, onLeft]);

  const onShare = useCallback(async () => {
    const url = `${window.location.origin}/group/${group.code}`;
    const payload = {
      title: `Aloya group trip to ${group.destination_label}`,
      text: `Join me — we'll see each other converge on ${group.destination_label}.`,
      url,
    };
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share(payload);
        return;
      }
    } catch { /* fallthrough */ }
    try {
      await navigator.clipboard.writeText(url);
    } catch { /* ignore */ }
  }, [group.code, group.destination_label]);

  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-line">
      <div className="flex items-center gap-2">
        <PulseDot />
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          You're sharing live
        </p>
      </div>
      <p className="mt-2 font-sans text-[13px] font-medium text-ink">
        Everyone in the group can see your position and ETA update every ~25 seconds. Keep this tab open — close it or tap Leave to stop sharing.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onShare}
          className="rounded-xl bg-aegean-deep px-4 py-2 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-limestone transition-opacity hover:opacity-90"
        >
          Invite more people
        </button>
        <button
          type="button"
          onClick={onLeave}
          disabled={busy}
          className="rounded-xl bg-ink/5 px-4 py-2 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition-opacity hover:bg-ink/10 disabled:opacity-60"
        >
          {busy ? "Leaving…" : "Leave group"}
        </button>
      </div>
    </div>
  );
}

/* ————————————————————— Plan my route ————————————————————— */

function PlanRouteCard({ group, joined }: { group: GroupRow; joined: boolean }) {
  const [busy, setBusy] = useState(false);
  const active = useActiveTrip();

  // Consider the trip a match for this group if the destination is within
  // ~500m of the group's meetup point — same "you're headed here" intent.
  const activeMatches = useMemo(() => {
    if (!active) return false;
    const dLat = active.to.lat - group.destination_lat;
    const dLng = active.to.lng - group.destination_lng;
    const approxMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111_000;
    return approxMeters < 500;
  }, [active, group.destination_lat, group.destination_lng]);

  const readPosition = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 6_000 },
      );
    });
  }, []);

  const goPlan = useCallback(async () => {
    setBusy(true);
    try {
      const fix = await readPosition();
      const params = new URLSearchParams();
      params.set("toLat", String(group.destination_lat));
      params.set("toLng", String(group.destination_lng));
      params.set("toLabel", group.destination_label);
      if (fix) {
        params.set("fromLat", String(fix.lat));
        params.set("fromLng", String(fix.lng));
        params.set("fromLabel", "My location");
      }
      window.location.assign(`/trips?${params.toString()}`);
    } finally {
      setBusy(false);
    }
  }, [group.destination_label, group.destination_lat, group.destination_lng, readPosition]);

  if (active && activeMatches) {
    const busLeg = active.option.legs.find((l) => l.kind === "bus");
    const routeShort = busLeg && busLeg.kind === "bus" ? busLeg.routeShort : null;
    const arrivalUnix =
      active.itinerary?.arrivalUnix ??
      (active.option.legs[active.option.legs.length - 1] as { arrivalUnix?: number } | undefined)?.arrivalUnix;
    const minsAway = arrivalUnix
      ? Math.max(0, Math.round((arrivalUnix * 1000 - Date.now()) / 60_000))
      : null;
    return (
      <section className="rounded-3xl bg-limestone-soft p-5 ring-1 ring-line">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-aegean-deep">
          Trip in progress
        </p>
        <h2 className="mt-1 font-display text-[20px] font-semibold leading-tight text-ink">
          {routeShort
            ? `You're on the ${routeShort} to ${group.destination_label}`
            : `You're on your way to ${group.destination_label}`}
        </h2>
        <p className="mt-2 font-sans text-[13px] font-medium text-ink-soft">
          {minsAway != null
            ? `Arriving in about ${minsAway} min. Open the live trip for turn-by-turn guidance — the group already sees your ETA.`
            : "Open the live trip for turn-by-turn guidance — the group already sees your ETA."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/trip/${active.option.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-aegean-deep px-5 py-3 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-limestone transition-opacity hover:opacity-90"
          >
            Resume trip
          </a>
          <button
            type="button"
            onClick={goPlan}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink/5 px-4 py-3 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink/10 disabled:opacity-60"
          >
            {busy ? "Locating…" : "Plan a different route"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-limestone-soft p-5 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-aegean-deep">
            {joined ? "Now get there" : "Plan your route"}
          </p>
          <h2 className="mt-1 font-display text-[20px] font-semibold leading-tight text-ink">
            {joined
              ? "Plan the bus that gets you to the meetup"
              : `Find the bus to ${group.destination_label}`}
          </h2>
          <p className="mt-2 font-sans text-[13px] font-medium text-ink-soft">
            {joined
              ? "The group can see your live ETA already. Open the planner to see which bus to catch, when it leaves, and turn-by-turn guidance."
              : "Get door-to-door directions with live bus times, then join the group so everyone sees you converging."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={goPlan}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-aegean-deep px-5 py-3 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-limestone transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Locating…" : "Plan my route"}
        </button>
        <a
          href={`/trips?toLat=${group.destination_lat}&toLng=${group.destination_lng}&toLabel=${encodeURIComponent(group.destination_label)}`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink/5 px-4 py-3 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink/10"
        >
          Type start point
        </a>
      </div>
      <p className="mt-3 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
        Uses live Cyprus bus schedules · you can come back to this page anytime
      </p>
    </section>
  );
}

/* ————————————————————————— Explainer ————————————————————————— */


function HowThisWorks() {
  const items: [string, string][] = [
    ["01", "Everyone opens this link and joins with their name."],
    ["02", "Aloya reads your live position and computes a real transit ETA to the destination."],
    ["03", "You see each other converge on one map, in real time, until the group meets."],
  ];
  return (
    <section className="rounded-3xl bg-limestone-soft p-5 ring-1 ring-line">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
        How this works
      </p>
      <ol className="mt-3 flex flex-col gap-3">
        {items.map(([n, text]) => (
          <li key={n} className="flex gap-3">
            <span className="font-mono text-[11px] font-semibold text-aegean-deep">{n}</span>
            <span className="font-sans text-[13px] font-medium text-ink">{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ————————————————————————— Chrome ————————————————————————— */

function Footer({ code }: { code: string }) {
  return (
    <footer className="mt-2 flex flex-col items-center gap-2 py-4">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
        Group {code} · shared via Aloya
      </p>
      <a
        href="https://app.aloya.cy"
        className="font-sans text-[13px] font-semibold text-aegean-deep underline-offset-4 hover:underline"
      >
        Ride Cyprus with Aloya
      </a>
    </footer>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-limestone text-ink">{children}</main>;
}

function LoadingState() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <PulseDot />
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
        Tuning into the group
      </p>
      <h1 className="font-display text-[22px] font-semibold text-ink">One moment</h1>
    </div>
  );
}

function MissingState() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <img
        src={heroArt}
        alt=""
        aria-hidden
        width={800}
        height={480}
        className="w-64 rounded-2xl opacity-70 ring-1 ring-line"
      />
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
        Aloya
      </p>
      <h1 className="font-display text-[24px] font-semibold text-ink">Group not found</h1>
      <p className="font-sans text-[14px] font-medium text-ink-soft">
        This link doesn't match an active group. Ask whoever shared it to send a fresh one.
      </p>
      <a
        href="https://app.aloya.cy"
        className="mt-2 rounded-xl bg-ink px-5 py-3 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-limestone"
      >
        Open Aloya
      </a>
    </div>
  );
}

function PulseDot() {
  return (
    <span className="relative inline-flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-aegean-deep opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-aegean-deep" />
    </span>
  );
}
