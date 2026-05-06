// Public "group trip" watch page — everyone converging on one destination
// sees each other on a single map with live ETAs. No account required to
// watch; joining just needs a display name + browser geolocation.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPreview } from "@/components/MapPreview";

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

export const Route = createFileRoute("/group/$code")({
  head: () => {
    const title = "Group trip — Aloya";
    const desc = "Everyone in your group, converging on one place. Live.";
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

  // Realtime subscription — instant member updates when active.
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

  if (groupQuery.isLoading) return <Shell><Placeholder title="Loading group…" /></Shell>;
  if (groupQuery.isError || !group) {
    return (
      <Shell>
        <Placeholder
          title="Group not found"
          body="This code doesn't match an active group. Check the link and try again."
        />
      </Shell>
    );
  }

  const expired = new Date(group.expires_at).getTime() < Date.now();
  const members = membersQuery.data ?? [];

  return (
    <Shell>
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-5 py-6">
        <Header code={group.code} expired={expired} />
        <DestinationCard group={group} activeMembers={members.filter((m) => m.status === "active").length} />
        <GroupMap group={group} members={members} />
        <MembersList members={members} />
        {!expired && <JoinCard group={group} />}
        <Footer />
      </div>
    </Shell>
  );
}

function Header({ code, expired }: { code: string; expired: boolean }) {
  return (
    <header className="flex items-baseline justify-between">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
        Group trip
      </p>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-ink">
        {expired ? "ended" : `code · ${code}`}
      </p>
    </header>
  );
}

function DestinationCard({ group, activeMembers }: { group: GroupRow; activeMembers: number }) {
  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-line">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
        Everyone heading to
      </p>
      <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">
        {group.destination_label}
      </h1>
      <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
        {activeMembers} {activeMembers === 1 ? "rider" : "riders"} active
        {group.created_by_name ? ` · started by ${group.created_by_name}` : null}
      </p>
    </div>
  );
}

const MEMBER_TONES = ["aegean", "ochre", "olive", "ink"] as const;

function GroupMap({ group, members }: { group: GroupRow; members: MemberRow[] }) {
  const markers = useMemo(() => {
    const list: {
      lat: number;
      lng: number;
      label: string;
      kind: "pin" | "destination";
      tone?: (typeof MEMBER_TONES)[number];
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
        label: m.display_name,
        kind: "pin",
        tone: MEMBER_TONES[i % MEMBER_TONES.length],
      });
    });
    return list;
  }, [group, members]);

  const fixCount = markers.filter((m) => m.kind === "pin").length;
  const center = fixCount === 0
    ? { lat: group.destination_lat, lng: group.destination_lng }
    : undefined; // let MapPreview fit to markers

  return (
    <div className="overflow-hidden rounded-3xl ring-1 ring-line">
      <MapPreview
        height="360px"
        center={center}
        spanKm={fixCount === 0 ? 4 : undefined}
        markers={markers}
        liveVehicles={false}
      />
    </div>
  );
}

function MembersList({ members }: { members: MemberRow[] }) {
  const now = Date.now();
  return (
    <ul className="flex flex-col gap-2">
      {members.map((m, i) => {
        const tone = MEMBER_TONES[i % MEMBER_TONES.length];
        const dot =
          tone === "aegean"
            ? "bg-aegean-deep"
            : tone === "ochre"
              ? "bg-ochre"
              : tone === "olive"
                ? "bg-olive"
                : "bg-ink";
        const updatedSec = m.last_updated
          ? Math.max(0, Math.round((now - new Date(m.last_updated).getTime()) / 1000))
          : null;
        const stale = updatedSec != null && updatedSec > 120;
        const left = m.status !== "active";
        return (
          <li
            key={m.id}
            className={`flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-line ${
              left ? "opacity-60" : ""
            }`}
          >
            <span className={`inline-block size-3 rounded-full ${dot}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[15px] font-semibold text-ink">
                {m.display_name}
                {m.is_creator && (
                  <span className="ml-2 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
                    host
                  </span>
                )}
              </p>
              <p className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                {left
                  ? "left the group"
                  : m.eta_minutes != null
                    ? `${m.eta_minutes} min away`
                    : m.last_lat != null
                      ? "en route"
                      : "not yet moving"}
                {updatedSec != null && !left && (
                  <>
                    {" · "}
                    {stale ? "reconnecting" : `updated ${updatedSec < 60 ? `${updatedSec}s` : `${Math.round(updatedSec / 60)}m`} ago`}
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function JoinCard({ group }: { group: GroupRow }) {
  const [name, setName] = useState<string>("");
  const [joined, setJoined] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const memberTokenRef = useRef<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const lastPingRef = useRef(0);

  // Hydrate persisted membership after mount (localStorage is browser-only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem(MEMBER_TOKEN_KEY(group.code));
    if (token) {
      memberTokenRef.current = token;
      setJoined(true);
    }
  }, [group.code]);

  const startWatching = useCallback((token: string) => {
    if (!("geolocation" in navigator)) return;
    if (watchRef.current != null) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPingRef.current < PING_INTERVAL_MS) return;
        lastPingRef.current = now;
        void supabase
          .from("trip_group_members")
          .update({
            last_lat: pos.coords.latitude,
            last_lng: pos.coords.longitude,
            last_updated: new Date().toISOString(),
          })
          .eq("member_token", token);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
  }, []);

  useEffect(() => {
    if (joined && memberTokenRef.current) startWatching(memberTokenRef.current);
    return () => {
      if (watchRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [joined, startWatching]);

  const onJoin = useCallback(async () => {
    setErr(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErr("Enter your name so the group knows who you are.");
      return;
    }
    setBusy(true);
    try {
      const token = crypto.randomUUID();
      const { error } = await supabase.from("trip_group_members").insert({
        group_id: group.id,
        member_token: token,
        display_name: trimmed.slice(0, 40),
        status: "active",
      });
      if (error) {
        setErr("Couldn't join. Try again in a moment.");
        return;
      }
      localStorage.setItem(MEMBER_TOKEN_KEY(group.code), token);
      memberTokenRef.current = token;
      setJoined(true);
    } finally {
      setBusy(false);
    }
  }, [name, group.id, group.code]);

  if (joined) {
    return (
      <div className="rounded-3xl bg-limestone-soft p-5 ring-1 ring-line">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          You're in
        </p>
        <p className="mt-1 font-sans text-[13px] font-medium text-ink">
          Sharing your live position with the group. Keep this tab open — close it to stop sharing.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-line">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
        Join the group
      </p>
      <h2 className="mt-1 font-display text-[18px] font-semibold text-ink">
        Share your live ETA too
      </h2>
      <p className="mt-2 font-sans text-[13px] font-medium text-ink-soft">
        Enter your name and allow location — everyone in the group will see you converge on {group.destination_label}.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          className="min-w-0 flex-1 rounded-xl bg-limestone-soft px-4 py-3 font-sans text-[14px] font-medium text-ink ring-1 ring-line placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-aegean-deep/40"
        />
        <button
          type="button"
          onClick={onJoin}
          disabled={busy}
          className="rounded-xl bg-ink px-5 py-3 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-limestone transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
      {err && (
        <p className="mt-2 font-sans text-[12px] font-semibold text-red-700">{err}</p>
      )}
    </div>
  );
}

function Footer() {
  return (
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
