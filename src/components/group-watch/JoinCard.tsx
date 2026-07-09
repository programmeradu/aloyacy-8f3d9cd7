// Guest → member: name entry plus one geolocation read, then the browser
// keeps its own per-group token so the page knows which card is "you".

import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { joinTripGroup } from "@/lib/trip-groups.functions";
import { MEMBER_TOKEN_KEY, readPosition, type GroupRow } from "./kit";

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
        data: { code: group.code, displayName: trimmed.slice(0, 40), origin: origin ?? undefined },
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
    <div className="rounded-3xl bg-ink p-5 text-limestone ring-1 ring-ink">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-limestone/70">
        Join this trip
      </p>
      <h2 className="mt-1 font-display text-[22px] font-semibold leading-tight">
        Share your live ETA with the group
      </h2>
      <p className="mt-2 font-sans text-[13px] font-medium text-limestone/80">
        Enter your name and allow location. Everyone converging on {group.destination_label} will
        see you appear on the map with a live ETA.
      </p>
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
          className="min-w-0 flex-1 basis-40 rounded-xl bg-limestone/10 px-4 py-3 font-sans text-[14px] font-semibold text-limestone ring-1 ring-limestone/20 placeholder:text-limestone/50 focus:outline-none focus:ring-2 focus:ring-ochre/60"
        />
        <button
          type="button"
          onClick={onJoin}
          disabled={busy}
          className="min-h-11 shrink-0 rounded-xl bg-ochre px-5 py-3 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
      {err && <p className="mt-2 font-sans text-[12px] font-semibold text-ochre">{err}</p>}
      <p className="mt-3 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-limestone/60">
        Location shared only while this tab is open · leave any time
      </p>
    </div>
  );
}
