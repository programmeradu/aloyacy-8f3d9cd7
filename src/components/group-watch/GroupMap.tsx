// Live map of the group: destination pin plus one dot per member who is
// actively sharing a position.

import { useMemo } from "react";
import { MapPreview } from "@/components/MapPreview";
import type { DomPin } from "@/components/map/useDomPins";
import { normaliseMode } from "@aloya/core/group-mode";
import type { GroupRow, MemberRow, Tone } from "./kit";
import { PulseDot } from "./chrome";
import { MemberAvatar } from "./MemberAvatar";

export function GroupMap({
  group,
  members,
  meId,
}: {
  group: GroupRow;
  members: MemberRow[];
  meId: string | null;
}) {
  const markers = useMemo(() => {
    const list: {
      lat: number;
      lng: number;
      label: string;
      kind: "bounds" | "destination";
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
    members.forEach((m) => {
      if (m.status !== "active" || m.last_lat == null || m.last_lng == null) return;
      // Members are drawn as avatar pins; this entry only keeps them in view.
      list.push({ lat: m.last_lat, lng: m.last_lng, label: m.display_name, kind: "bounds" });
    });
    return list;
  }, [group, members]);

  // Each sharing member on the map: their avatar, travel-mode badge, first name.
  const pins: DomPin[] = useMemo(
    () =>
      members
        .filter((m) => m.status === "active" && m.last_lat != null && m.last_lng != null)
        .map((m) => {
          const isMe = m.id === meId;
          const first = m.display_name.trim().split(/\s+/)[0] ?? m.display_name;
          return {
            id: m.id,
            lat: m.last_lat as number,
            lng: m.last_lng as number,
            anchor: "center" as const,
            node: (
              <span className="r-member-pin">
                <MemberAvatar
                  seed={m.id}
                  name={isMe ? `${m.display_name} (you)` : m.display_name}
                  size={44}
                  ring={isMe ? "#F6B83C" : "#ffffff"}
                  mode={normaliseMode(m.mode)}
                />
                <span className="r-member-pin-name">{isMe ? "You" : first}</span>
              </span>
            ),
          };
        }),
    [members, meId],
  );

  const fixCount = pins.length;
  const center =
    fixCount === 0 ? { lat: group.destination_lat, lng: group.destination_lng } : undefined;

  return (
    <section className="relative overflow-hidden rounded-3xl ring-1 ring-line">
      <div className="pointer-events-none absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-limestone/90 px-3 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink ring-1 ring-line backdrop-blur">
        <PulseDot />
        &nbsp;Live map · {fixCount} sharing
      </div>
      <MapPreview
        height="h-[380px]"
        center={center}
        spanKm={fixCount === 0 ? 4 : undefined}
        markers={markers}
        pins={pins}
        liveVehicles={false}
      />
      {fixCount === 0 && (
        <p className="border-t border-line bg-card px-4 py-3 font-sans text-[12px] font-medium text-ink-soft">
          Waiting for the first person to start moving. Positions appear the moment someone joins
          and shares location.
        </p>
      )}
    </section>
  );
}
