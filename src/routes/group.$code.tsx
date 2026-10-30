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
//
// Sections live in src/components/group-watch/; this file is composition,
// data fetching and head metadata only.

import { ogImage as ogUrl } from "@/lib/og-url";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTripGroupView } from "@/lib/public-views.functions";
import { GroupMap } from "@/components/group-watch/GroupMap";
import { Hero, IdentityRibbon } from "@/components/group-watch/Hero";
import { JoinCard } from "@/components/group-watch/JoinCard";
import { LiveShareCard } from "@/components/group-watch/LiveShareCard";
import { ConvergeCard, MembersList } from "@/components/group-watch/MembersList";
import { PlanRouteCard } from "@/components/group-watch/PlanRouteCard";
import { Footer, HowThisWorks, LoadingState, MissingState } from "@/components/group-watch/states";
import { MEMBER_TOKEN_KEY, type GroupRow, type MemberRow } from "@/components/group-watch/kit";
import { Shell } from "@/components/group-watch/chrome";

export const Route = createFileRoute("/group/$code")({
  head: ({ params }) => {
    const code = String(params.code || "").toUpperCase();
    const title = `Group trip · ${code} · Aloya`;
    const desc =
      "Everyone in your group, converging on one place. Live positions and arrival ETAs update as friends move.";
    // Group share card (drawn at build time, served by /api/public/og/group).
    // Minute-bucket cache-buster nudges platforms that key by URL to re-scrape
    // as members join and ETAs slide.
    const bucket = Math.floor(Date.now() / 60_000);
    const ogImage = ogUrl(`/api/public/og/group/${encodeURIComponent(code)}?v=${bucket}`);
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
        { property: "og:image:secure_url", content: ogImage },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:type", content: "image/png" },
        {
          property: "og:image:alt",
          content: "Live group trip preview: destination, host, and joined members",
        },
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

type GroupView = GroupRow & { members: MemberRow[]; me_id: string | null };

function GroupWatchPage() {
  const { code } = Route.useParams();

  // Current viewer's token → so we can highlight "this is you".
  const [myToken, setMyToken] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setMyToken(window.localStorage.getItem(MEMBER_TOKEN_KEY(code.toUpperCase())));
  }, [code]);

  const viewQuery = useQuery({
    queryKey: ["trip-group-view", code, myToken],
    queryFn: async () => {
      const data = await getTripGroupView({
        data: { code: code.toUpperCase(), memberToken: myToken ?? null },
      });
      return (data as GroupView | null) ?? null;
    },
    refetchInterval: 15_000,
  });

  const group: GroupRow | null = viewQuery.data
    ? (({ members: _m, me_id: _me, ...g }) => g as GroupRow)(viewQuery.data)
    : null;
  const meId = viewQuery.data?.me_id ?? null;
  const members: MemberRow[] = viewQuery.data?.members ?? [];

  if (viewQuery.isLoading)
    return (
      <Shell>
        <LoadingState />
      </Shell>
    );
  if (viewQuery.isError || !group) {
    return (
      <Shell>
        <MissingState />
      </Shell>
    );
  }

  const expired = new Date(group.expires_at).getTime() < Date.now();
  const meIndex = meId ? members.findIndex((m) => m.id === meId) : -1;
  const me = meIndex >= 0 ? members[meIndex] : null;

  return (
    <Shell>
      <div className="mx-auto flex min-h-dvh max-w-[440px] flex-col">
        <Hero group={group} members={members} expired={expired} me={me} />

        <div
          className="r-legacy flex flex-col gap-4 px-4 pt-4"
          style={{ paddingBottom: "calc(var(--r-safe-bottom) + 40px)" }}
        >
          <IdentityRibbon
            me={me}
            meIndex={meIndex}
            hasToken={!!myToken}
            expired={expired}
            hostName={group.created_by_name}
          />
          <ConvergeCard members={members} expired={expired} />
          <GroupMap group={group} members={members} meId={meId} />
          {!expired && <PlanRouteCard group={group} joined={me != null} />}
          <MembersList members={members} meId={meId} />
          {!expired && me == null && <JoinCard group={group} onJoined={setMyToken} />}
          {!expired && me != null && myToken && (
            <LiveShareCard group={group} memberToken={myToken} onLeft={() => setMyToken(null)} />
          )}
          <HowThisWorks />
          <Footer code={group.code} />
        </div>
      </div>
    </Shell>
  );
}
