// Group hero: destination headline, live/ended badge, avatar stack, plus the
// ribbon that tells the current viewer which member card is them.

import { initials } from "@aloya/core/group-format";
import {
  heroArt,
  PulseDot,
  toneClasses,
  toneForIndex,
  type GroupRow,
  type MemberRow,
} from "./kit";

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
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-ink">
            Aloya · Live group
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-limestone/90 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-ink ring-1 ring-line backdrop-blur">
            {expired ? (
              "Ended"
            ) : (
              <>
                <PulseDot />
                &nbsp;Live · {group.code}
              </>
            )}
          </span>
        </div>

        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
            Everyone converging on
          </p>
          <h1 className="mt-2 text-balance font-display text-[34px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[42px]">
            {group.destination_label}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AvatarStack members={members} />
          <p className="font-sans text-[13px] font-semibold text-ink">
            {active} {active === 1 ? "person" : "people"} on the way
            {group.created_by_name ? (
              <span className="font-medium text-ink-soft">
                {" "}
                · hosted by {group.created_by_name}
              </span>
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
        const t = toneClasses(toneForIndex(i));
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
  if (expired) return null;
  if (me) {
    const t = toneClasses(toneForIndex(meIndex));
    return (
      <div className={`flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ${t.ring}`}>
        <span
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold uppercase ${t.chip}`}
        >
          {initials(me.display_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-soft">
            You appear as
          </p>
          <p className="break-words font-display text-[16px] font-semibold leading-snug text-ink">
            {me.display_name}
            {me.is_creator ? " · host" : ""}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-limestone-soft px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          <PulseDot />
          &nbsp;sharing
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
        {hostName ? `${hostName} shared this trip with you.` : "Someone shared this trip with you."}{" "}
        Join below and everyone will see your ETA too — otherwise you'll just watch.
      </p>
      {hasToken && (
        <p className="mt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Previous session ended
        </p>
      )}
    </div>
  );
}
