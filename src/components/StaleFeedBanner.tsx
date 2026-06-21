// Tiny status banner surfaced in the live trip companion when:
//  - the realtime feed is stale (proxy down or > 60 s since last fetch), OR
//  - the rider is on board but the vehicle has vanished from the feed
//    (we silently fall back to the phone GPS, but we tell the rider why)
//
// Editorial, honest, no emojis, no icon spam. Mediterranean palette.

import { useI18n, type DictKey } from "@/lib/i18n";

type Variant = "feed-stale" | "vehicle-lost" | "next-not-tracked" | "ghost-bus";

const META: Record<Variant, { label: DictKey; detail: DictKey; tone: string }> = {
  "feed-stale": {
    label: "stale.feedStale.label",
    detail: "stale.feedStale.detail",
    tone: "bg-ochre-soft/60 ring-ochre/30 text-ink",
  },
  "vehicle-lost": {
    label: "stale.vehicleLost.label",
    detail: "stale.vehicleLost.detail",
    tone: "bg-aegean-soft/60 ring-aegean/25 text-ink",
  },
  "next-not-tracked": {
    label: "stale.nextNotTracked.label",
    detail: "stale.nextNotTracked.detail",
    tone: "bg-card ring-line text-ink-soft",
  },
  "ghost-bus": {
    label: "stale.ghostBus.label",
    detail: "stale.ghostBus.detail",
    tone: "bg-ochre-soft/70 ring-ochre/40 text-ink",
  },
};


export function StaleFeedBanner({ variant }: { variant: Variant }) {
  const { t } = useI18n();
  const c = META[variant];
  return (
    <section className="px-6 animate-rise">
      <div className={`rounded-[24px] ring-1 px-5 py-4 ${c.tone}`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em]">
          {t(c.label)}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
          {t(c.detail)}
        </p>
      </div>
    </section>
  );
}
