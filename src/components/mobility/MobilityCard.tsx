// Shared Roam layout for every last-mile and micro-mobility card on Go
// (Bolt ride, Bolt scooter, Nextbike, Kapnos, taxi, park and ride). One white soft card:
//   provider row (real logo tile, name, mode, quiet aside)
//   headline
//   one row of compact stats that never wraps at 360 to 430px
//   optional pick up / drop off rows
//   one primary button, secondary actions as equal pills in one row
//   a quiet sentence-case footnote
// No eyebrows, no letter-spaced caps, no middle dots, no em or en dashes.
//
// Every action is a plain <a href> so the tap itself opens the app (iOS
// blocks window.open after async work). Universal links open the native
// app when it is installed and fall back to the store otherwise.

import type { ReactNode } from "react";
import { Icon } from "@/components/roam/Icon";

export type Provider = "bolt" | "nextbike" | "kapnos" | "taxi" | "parkride";

const LOGO: Record<Exclude<Provider, "taxi">, { src: string; bg: string; alt: string }> = {
  bolt: { src: "/brands/bolt.png", bg: "#2a9c64", alt: "Bolt" },
  nextbike: { src: "/brands/nextbike.png", bg: "#0046d7", alt: "Nextbike" },
  kapnos: { src: "/brands/kapnos-mark.png", bg: "#ffffff", alt: "Kapnos Airport Shuttle" },
  // Official Pame Express logo (CPT's Nicosia park and ride), vector paths taken
  // unchanged from CPT's own leaflet on publictransport.com.cy, on its navy panel.
  parkride: { src: "/brands/pame-express.svg", bg: "#00427A", alt: "Pame Express park and ride" },
};

/** Display-safe place name: no spaced dashes, no en or em dashes. */
export function cleanPlace(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/^\([A-Z0-9]+\)\s*/i, "")
    .replace(/\s+[-\u2010-\u2015]+\s+/g, ", ")
    .replace(/[\u2013\u2014\u2015]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*,/g, ",")
    .trim();
}

export function ProviderTile({ provider, size = 40 }: { provider: Provider; size?: number }) {
  if (provider === "taxi") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[12px] bg-[var(--r-y,#f6b83c)] text-[#171717]"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
        aria-hidden
      >
        <Icon name="taxi" />
      </span>
    );
  }
  const l = LOGO[provider];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] ring-1 ring-black/5"
      style={{ width: size, height: size, background: l.bg }}
    >
      <img
        src={l.src}
        alt={l.alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </span>
  );
}

export type MobilityStat = {
  label: string;
  /** Big numeral part, e.g. "9", "4.0", "€6". */
  value: ReactNode;
  /** Small unit after the numeral, e.g. "min", "km". */
  unit?: string;
};

export type MobilityAction = {
  href: string;
  label: string;
  icon?: string;
  /** External web or app link: opens outside the PWA shell. */
  external?: boolean;
};

function linkProps(a: MobilityAction) {
  return a.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

export function MobilityStats({ stats }: { stats: MobilityStat[] }) {
  return (
    <dl
      className="grid overflow-hidden rounded-[18px] bg-[var(--r-pill,#eeeeea)]"
      // auto tracks: each column is at least its content, spare width shared out,
      // so a long fare range never spills out of its tile.
      style={{ gridTemplateColumns: `repeat(${stats.length}, auto)` }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`flex min-w-0 flex-col-reverse gap-1 px-2.5 py-2.5 min-[380px]:px-3 ${
            i > 0 ? "border-l border-white" : ""
          }`}
        >
          <dt className="truncate text-[12px] leading-4 text-[var(--r-mute,#6f6f6a)]">{s.label}</dt>
          <dd className="flex items-baseline gap-1 whitespace-nowrap leading-none text-[#171717] [font-variant-numeric:tabular-nums]">
            <span className="text-[clamp(18px,5.4vw,22px)] font-medium tracking-[-0.02em]">
              {s.value}
            </span>
            {s.unit ? (
              <span className="text-[12px] font-medium text-[var(--r-mute,#6f6f6a)]">{s.unit}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "€6 to €8" with a quiet connector word. */
export function RangeValue({ low, high, joiner }: { low: string; high: string; joiner: string }) {
  if (low === high) return <>{low}</>;
  return (
    <>
      {low}
      <span className="mx-1 text-[12px] font-medium tracking-normal text-[var(--r-mute,#6f6f6a)]">
        {joiner}
      </span>
      {high}
    </>
  );
}

export type MobilityStop = { label: string; name: string; meta?: string };

export function MobilityStops({ stops }: { stops: MobilityStop[] }) {
  return (
    <ul className="flex flex-col">
      {stops.map((s, i) => (
        <li
          key={`${s.label}-${i}`}
          className={`flex min-w-0 items-center gap-3 py-2 ${i > 0 ? "border-t border-[var(--r-line,#e7e7e3)]" : ""}`}
        >
          <span
            className={`inline-block size-2 shrink-0 rounded-full ${
              i === 0 ? "bg-[var(--r-y,#f6b83c)]" : "bg-[#171717]"
            }`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium leading-5 text-[#171717]">{s.name}</p>
            <p className="truncate text-[12px] leading-4 text-[var(--r-mute,#6f6f6a)]">
              {s.meta ? `${s.label}, ${s.meta}` : s.label}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MobilityCard({
  provider,
  name,
  mode,
  aside,
  headline,
  sub,
  stats,
  children,
  primary,
  secondary = [],
  note,
}: {
  provider: Provider;
  name: string;
  mode: string;
  aside?: string;
  headline: string;
  sub?: string;
  stats?: MobilityStat[];
  children?: ReactNode;
  primary: MobilityAction;
  secondary?: MobilityAction[];
  note?: string;
}) {
  return (
    <article className="r-mob animate-rise flex flex-col gap-3.5 rounded-[26px] bg-white px-[18px] pb-[18px] pt-4 text-[#171717]">
      <header className="flex min-w-0 items-center gap-3">
        <ProviderTile provider={provider} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-5">{name}</p>
          <p className="truncate text-[13px] leading-[18px] text-[var(--r-mute,#6f6f6a)]">{mode}</p>
        </div>
        {aside ? (
          <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full bg-[var(--r-pill,#eeeeea)] px-2.5 text-[12px] font-medium text-[#171717] [font-variant-numeric:tabular-nums]">
            {aside}
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-1">
        <h3 className="text-balance text-[21px] font-medium leading-[1.2] tracking-[-0.015em]">
          {headline}
        </h3>
        {sub ? (
          <p className="text-[13px] leading-[1.35] text-[var(--r-mute,#6f6f6a)]">{sub}</p>
        ) : null}
      </div>

      {stats && stats.length > 0 ? <MobilityStats stats={stats} /> : null}

      {children}

      <div className="flex flex-col gap-2">
        <a
          href={primary.href}
          {...linkProps(primary)}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#171717] px-5 text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
        >
          {primary.label}
          <Icon name={primary.icon ?? "arrow-up-right"} size={17} />
        </a>
        {secondary.length > 0 ? (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${secondary.length}, minmax(0, 1fr))` }}
          >
            {secondary.map((a) => (
              <a
                key={a.href + a.label}
                href={a.href}
                {...linkProps(a)}
                className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full bg-[var(--r-pill,#eeeeea)] px-3 text-[14px] font-medium text-[#171717] transition-transform active:scale-[0.98]"
              >
                {a.icon ? <Icon name={a.icon} size={16} /> : null}
                <span className="truncate">{a.label}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {note ? (
        <p className="text-[12px] leading-4 text-[var(--r-mute,#6f6f6a)]">{note}</p>
      ) : null}
    </article>
  );
}
