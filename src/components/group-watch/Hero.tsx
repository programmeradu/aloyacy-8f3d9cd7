// Group hero: destination headline, live/ended badge, avatar stack, plus the
// ribbon that tells the current viewer which member card is them.

import { MemberAvatar } from "./MemberAvatar";
import { useMyAvatar } from "./avatar-store";
import { normaliseMode } from "@aloya/core/group-mode";
import { toneClasses, toneForIndex, type GroupRow, type MemberRow } from "./kit";
import { PulseDot } from "./chrome";
import { BackButton } from "@/components/roam/FrostButton";

export function Hero({
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
    <header className="px-4" style={{ paddingTop: "calc(var(--r-safe-top) + 10px)" }}>
      <div className="flex min-h-[54px] items-center gap-3">
        <BackButton label="Back" variant="light" fallback="/" />
        <p className="flex-1 truncate text-center text-[17px] font-medium">Live group</p>
        <span className="r-pill r-pill--w r-tnum">
          {expired ? (
            "Ended"
          ) : (
            <>
              <span className="r-dot r-live-pulse" />
              {group.code}
            </>
          )}
        </span>
      </div>
      <section className="r-jc r-rise mt-3 px-5 pb-5 pt-5">
        <p className="r-lbl" style={{ color: "var(--r-onchar-mute)" }}>
          Everyone converging on
        </p>
        <h1 className="mt-1.5 text-balance text-[28px] font-normal leading-[1.1] tracking-[-0.02em] text-white">
          {group.destination_label}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <AvatarStack members={members} />
          <p className="text-[14px] text-white">
            {active} {active === 1 ? "person" : "people"} on the way
            {group.created_by_name ? (
              <span style={{ color: "var(--r-onchar-mute)" }}>
                {" "}
                · hosted by {group.created_by_name}
              </span>
            ) : null}
            {me ? <span style={{ color: "var(--r-onchar-mute)" }}> · including you</span> : null}
          </p>
        </div>
      </section>
    </header>
  );
}

function AvatarStack({ members }: { members: MemberRow[] }) {
  const shown = members.slice(0, 5);
  const extra = Math.max(0, members.length - shown.length);
  return (
    <div className="flex -space-x-2.5">
      {shown.map((m) => (
        <MemberAvatar
          key={m.id}
          seed={m.id}
          choice={m.avatar}
          name={m.display_name}
          size={40}
          ring="#262626"
        />
      ))}
      {extra > 0 && (
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-ink ring-2 ring-[#262626]">
          +{extra}
        </span>
      )}
    </div>
  );
}

export function IdentityRibbon({
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
  const [mine] = useMyAvatar();
  if (expired) return null;
  if (me) {
    const t = toneClasses(toneForIndex(meIndex));
    return (
      <div className={`flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ${t.ring}`}>
        <MemberAvatar
          seed={me.id}
          choice={mine ?? me.avatar}
          name={me.display_name}
          size={40}
          mode={normaliseMode(me.mode)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink-soft">You appear as</p>
          <p className="break-words font-display text-[16px] font-semibold leading-snug text-ink">
            {me.display_name}
            {me.is_creator ? " · host" : ""}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-limestone-soft px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
          <PulseDot />
          &nbsp;sharing
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <p className="text-[13px] font-medium text-ink-soft">You're watching as a guest</p>
      <p className="mt-1 font-sans text-[13px] font-medium text-ink">
        {hostName ? `${hostName} shared this trip with you.` : "Someone shared this trip with you."}{" "}
        Join below and everyone will see your ETA too, otherwise you'll just watch.
      </p>
      {hasToken && (
        <p className="mt-1 text-[12px] font-semibold text-ink-soft">Previous session ended</p>
      )}
    </div>
  );
}
