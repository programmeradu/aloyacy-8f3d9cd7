// Tiny status banner surfaced in the live trip companion when:
//  - the realtime feed is stale (proxy down or > 60 s since last fetch), OR
//  - the rider is on board but the vehicle has vanished from the feed
//    (we silently fall back to the phone GPS, but we tell the rider why)
//
// Editorial, honest, no emojis, no icon spam. Mediterranean palette.

type Variant = "feed-stale" | "vehicle-lost" | "next-not-tracked";

const COPY: Record<Variant, { label: string; detail: string; tone: string }> = {
  "feed-stale": {
    label: "Live feed paused",
    detail:
      "We can't reach the bus tracking service right now. Times shown are scheduled — we'll switch back the moment the feed returns.",
    tone: "bg-ochre-soft/60 ring-ochre/30 text-ink",
  },
  "vehicle-lost": {
    label: "Tracking from your phone",
    detail:
      "We lost sight of the bus on the live feed — using your GPS to keep the map and countdown honest until it comes back.",
    tone: "bg-aegean-soft/60 ring-aegean/25 text-ink",
  },
  "next-not-tracked": {
    label: "Next bus not yet tracked",
    detail:
      "Your connecting bus hasn't started sending its location yet. We'll surface it the moment it does.",
    tone: "bg-card ring-line text-ink-soft",
  },
};

export function StaleFeedBanner({ variant }: { variant: Variant }) {
  const c = COPY[variant];
  return (
    <section className="px-6 animate-rise">
      <div className={`rounded-[24px] ring-1 px-5 py-4 ${c.tone}`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em]">
          {c.label}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
          {c.detail}
        </p>
      </div>
    </section>
  );
}
