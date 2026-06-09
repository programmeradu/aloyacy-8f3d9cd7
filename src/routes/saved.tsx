import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { IconPin, IconArrowUpRight, IconClock } from "@/components/Icons";
import {
  removeSavedPlace,
  upsertSavedPlace,
  useRecents,
  useSavedPlaces,
  type SavedPlace,
} from "@/lib/trip-store";
import coast from "@/assets/coast-hero.jpg";
import { NotificationsCard } from "@/components/NotificationsCard";
import { OfflineSchedulesCard } from "@/components/OfflineSchedulesCard";
import { ProFeaturesUpsell } from "@/components/ProFeaturesUpsell";
import { useProPaywall } from "@/lib/useProPaywall";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/saved")({
  head: () => ({
    meta: [
      { title: "Saved — Aloya" },
      { name: "description", content: "Pinned places, recent journeys, and offline schedules for your Cyprus rides." },
      { property: "og:title", content: "Saved — Aloya" },
      { property: "og:description", content: "Pinned places, recent journeys, and offline schedules — kept close." },
      { property: "og:url", content: "https://aloyacy.online/saved" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://aloyacy.online/og/og-saved.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "A worn paper map of Cyprus held against a limestone wall, ochre ribbon marking a place." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://aloyacy.online/og/og-saved.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://aloyacy.online/saved" }],
  }),
  component: Saved,
});

const TONE_CYCLE: SavedPlace["tone"][] = ["aegean", "ochre", "olive"];

function Saved() {
  const { t } = useI18n();
  const saved = useSavedPlaces();
  const recents = useRecents();
  const { isPro, requirePro, paywall } = useProPaywall();

  function pinRecent(r: { id: string; name: string; lat: number; lng: number }, label: string) {
    requirePro(() => {
      const tone = TONE_CYCLE[saved.length % 3];
      upsertSavedPlace({
        id: r.id,
        label,
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        tone,
        pinned: true,
        createdAt: Date.now(),
      });
    });
  }

  return (
    <AppShell>
      <header className="px-6 pt-2 pb-5 animate-rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("saved.kicker")}
        </p>
        <h1 className="font-display text-4xl mt-2 text-ink">
          {t("saved.titlePrefix")} <span className="italic text-aegean-deep">{t("saved.titleEmph")}</span>.
        </h1>
      </header>

      <section className="px-6 animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="relative h-56 w-full overflow-hidden rounded-[28px] ring-1 ring-line">
          <img
            src={coast}
            alt={t("saved.coastAlt")}
            loading="lazy"
            width={1024}
            height={640}
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/65 via-ink/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-limestone">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-80">
              {t("saved.heroPinned", { n: saved.length })}
            </p>
            <h3 className="mt-1 font-display text-3xl italic leading-tight">
              {t("saved.heroTitle")}
            </h3>
            <p className="mt-1 text-[12px] opacity-80 max-w-[26ch]">
              {t("saved.heroBody")}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-7 px-6 animate-rise" style={{ animationDelay: "140ms" }}>
        <h2 className="font-display text-2xl text-ink mb-4">{t("saved.pinned")}</h2>
        {saved.length === 0 ? (
          <div className="rounded-3xl bg-card p-6 ring-1 ring-line">
            <p className="font-display text-lg text-ink">{t("saved.noPinsTitle")}</p>
            <p className="mt-1 text-[13px] text-ink-soft">
              {t("saved.noPinsBody")}
            </p>
            <Link
              to="/trips"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12px] text-limestone"
            >
              {t("saved.planTrip")}
              <IconArrowUpRight className="size-3.5" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {saved.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-4 rounded-3xl bg-card p-4 ring-1 ring-line"
              >
                <span
                  className={`flex size-12 items-center justify-center rounded-2xl ${
                    p.tone === "aegean"
                      ? "bg-aegean-soft/60 text-aegean-deep"
                      : p.tone === "ochre"
                      ? "bg-ochre-soft/70 text-ochre"
                      : "bg-olive/10 text-olive"
                  }`}
                >
                  <IconPin className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {p.label}
                  </p>
                  <p className="font-display text-lg leading-tight text-ink truncate">
                    {p.name}
                  </p>
                </div>
                <button
                  onClick={() => removeSavedPlace(p.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-limestone-soft px-3 py-1.5 font-sans text-[12px] font-semibold text-ink ring-1 ring-line hover:bg-card"
                >
                  {t("saved.unpin")}
                </button>

              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 px-6 pb-2 animate-rise" style={{ animationDelay: "200ms" }}>
        <h2 className="font-display text-2xl text-ink mb-4">{t("saved.recent")}</h2>
        {recents.length === 0 ? (
          <div className="rounded-3xl bg-card p-5 ring-1 ring-line text-[13px] text-ink-soft">
            {t("saved.recentEmpty")}
          </div>
        ) : (
          <div className="rounded-3xl bg-card ring-1 ring-line divide-y divide-line overflow-hidden">
            {recents.map((r) => (
              <RecentRow key={r.id} r={r} onPin={pinRecent} />
            ))}
          </div>
        )}
      </section>

      {isPro ? (
        <>
          <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "260ms" }}>
            <NotificationsCard />
          </section>
          <section className="mt-6 px-6 pb-12 animate-rise" style={{ animationDelay: "320ms" }}>
            <OfflineSchedulesCard />
          </section>
        </>
      ) : (
        <section className="mt-8 px-6 pb-12 animate-rise" style={{ animationDelay: "260ms" }}>
          <ProFeaturesUpsell />
        </section>
      )}
      {paywall}
    </AppShell>
  );
}

function RecentRow({
  r,
  onPin,
}: {
  r: { id: string; name: string; lat: number; lng: number; lastUsed: number };
  onPin: (r: { id: string; name: string; lat: number; lng: number }, label: string) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(t("saved.favourite"));
  const when = new Date(r.lastUsed).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  return (
    <div className="flex items-center gap-3 p-4">
      <IconClock className="size-4 text-ink-soft shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-base leading-tight text-ink truncate">
          {r.name}
        </p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {when}
        </p>
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-24 rounded-lg bg-limestone-soft px-2 py-1 text-[12px] outline-none ring-1 ring-line"
            placeholder={t("saved.placeholderHome")}
          />
          <button
            onClick={() => {
              onPin(r, label.trim() || t("saved.favourite"));
              setEditing(false);
            }}
            className="inline-flex items-center rounded-full bg-aegean-deep px-3 py-1.5 font-sans text-[12px] font-semibold text-limestone"
          >
            {t("saved.save")}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 font-sans text-[12px] font-semibold text-limestone hover:bg-ink/90"
        >
          {t("saved.pin")}
        </button>

      )}
    </div>
  );
}
