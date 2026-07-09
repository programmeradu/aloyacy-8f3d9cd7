// Explainer, footer and the loading / not-found shells for the group page.

import { heroArt } from "./kit";
import { PulseDot } from "./chrome";

export function HowThisWorks() {
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

export function Footer({ code }: { code: string }) {
  return (
    <footer className="mt-2 flex flex-col items-center gap-2 py-4">
      <p className="text-center font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
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

export function LoadingState() {
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

export function MissingState() {
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
