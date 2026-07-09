// Live map of the group: destination pin plus one dot per member who is
// actively sharing a position.

import { useMemo } from "react";
import { MapPreview } from "@/components/MapPreview";
import { PulseDot, toneForIndex, type GroupRow, type MemberRow, type Tone } from "./kit";
import { PulseDot } from "./chrome";

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
        label: m.id === meId ? `${m.display_name} (you)` : m.display_name,
        kind: "pin",
        tone: toneForIndex(i),
      });
    });
    return list;
  }, [group, members, meId]);

  const fixCount = markers.filter((m) => m.kind === "pin").length;
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
