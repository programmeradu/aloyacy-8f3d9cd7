// The group roster and the "arriving together" summary above it. All copy
// decisions live in @aloya/core/group-converge so they stay testable.

import { memberStatusLine, summariseConverge } from "@aloya/core/group-converge";
import { normaliseMode } from "@aloya/core/group-mode";
import { MemberAvatar, modeLabel } from "./MemberAvatar";
import { toneClasses, toneForIndex, type MemberRow } from "./kit";

export function MembersList({ members, meId }: { members: MemberRow[]; meId: string | null }) {
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
          const t = toneClasses(toneForIndex(i));
          const line = memberStatusLine({
            status: m.status,
            etaMinutes: m.eta_minutes,
            hasFix: m.last_lat != null,
            lastUpdated: m.last_updated,
            now,
          });
          const isMe = m.id === meId;
          const mode = normaliseMode(m.mode);
          const modeText = modeLabel(mode);
          return (
            <li
              key={m.id}
              className={`flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 transition-opacity ${
                isMe ? t.ring : "ring-line"
              } ${line.left ? "opacity-60" : ""}`}
            >
              <MemberAvatar seed={m.id} name={m.display_name} size={44} mode={mode} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-[15px] font-semibold leading-snug text-ink">
                  <span className="min-w-0 break-words">{m.display_name}</span>
                  {isMe && (
                    <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-limestone">
                      you
                    </span>
                  )}
                  {m.is_creator && !isMe && (
                    <span className="shrink-0 rounded-full bg-limestone-soft px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                      host
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-sans text-[12px] font-medium text-ink-soft">
                  {line.primary}
                  {modeText && !line.left ? ` · ${modeText}` : null}
                  {line.freshness ? ` · ${line.freshness}` : null}
                </p>
              </div>
              {!line.left && !line.stale && (
                <span className={`size-2 shrink-0 rounded-full ${t.dot} animate-pulse`} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ConvergeCard({ members, expired }: { members: MemberRow[]; expired: boolean }) {
  const summary = summariseConverge(
    members.filter((m) => m.status === "active").map((m) => m.eta_minutes),
  );
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
  if (!summary) return null;
  return (
    <div className="rounded-2xl bg-aegean-soft/40 p-5 ring-1 ring-aegean/20">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-aegean-deep">
        Arriving together
      </p>
      <p className="mt-1 text-balance font-display text-[24px] font-semibold leading-tight text-ink">
        {summary.headline}
      </p>
      <p className="mt-2 font-sans text-[13px] font-medium text-ink-soft">{summary.detail}</p>
    </div>
  );
}
