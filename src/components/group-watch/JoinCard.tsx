// Guest → member: name entry plus one geolocation read, then the browser
// keeps its own per-group token so the page knows which card is "you".

import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { joinTripGroup } from "@/lib/trip-groups.functions";
import { MEMBER_TOKEN_KEY, readPosition, type GroupRow } from "./kit";
import { AvatarPicker } from "./AvatarPicker";
import { readAvatar } from "./avatar-store";

export function JoinCard({
  group,
  onJoined,
}: {
  group: GroupRow;
  onJoined: (token: string) => void;
}) {
  const join = useServerFn(joinTripGroup);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
          avatar: readAvatar() ?? undefined,
        },
      });
      try {
        localStorage.setItem(MEMBER_TOKEN_KEY(group.code), res.memberToken);
      } catch {
        /* private mode — the session still works for this tab */
      }
      onJoined(res.memberToken);
    } catch {
      setErr("Couldn't join. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [name, group.code, join, onJoined]);

  return (
    <div className="roam rounded-[28px] p-5 text-white" style={{ background: "var(--r-char)" }}>
      <p className="text-[13px]" style={{ color: "var(--r-onchar-mute)" }}>
        Join this trip
      </p>
      <h2 className="mt-1 text-[22px] font-medium leading-tight" style={{ color: "#fff" }}>
        Share your live ETA with the group
      </h2>
      <p className="mt-2 text-[14px]" style={{ color: "var(--r-onchar-mute)" }}>
        Pick a character, enter your name and allow location. Everyone heading to{" "}
        {group.destination_label} sees you on the map with a live ETA.
      </p>
      <div className="mt-4">
        <AvatarPicker seed={group.code} dark />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void onJoin();
          }}
          placeholder="Your name"
          maxLength={40}
          aria-label="Your name"
          className="min-w-0 flex-1 basis-40 rounded-full bg-white/10 px-5 h-12 text-[16px] font-medium text-white ring-1 ring-white/20 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--r-y)]"
        />
        <button
          type="button"
          onClick={onJoin}
          disabled={busy}
          className="r-pill r-pill--y r-pill--lg h-12 px-6 disabled:opacity-60"
        >
          {busy ? "Joining" : "Join"}
        </button>
      </div>
      {err && (
        <p className="mt-2 text-[13px] font-medium" style={{ color: "var(--r-y)" }}>
          {err}
        </p>
      )}
      <p className="mt-3 text-[12px]" style={{ color: "var(--r-onchar-mute)" }}>
        Location is shared only while this page is open. Leave any time.
      </p>
    </div>
  );
}
