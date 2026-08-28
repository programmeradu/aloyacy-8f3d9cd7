// Honest screen for the Green Line. Doctrine: name it, say what we know,
// refuse hours we cannot stand behind. Silence on a Nicosia product reads
// as a hole.

import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { MapPreview } from "@/components/MapPreview";
import { useI18n } from "@/lib/i18n";
import { LEDRA_PEDESTRIAN } from "@aloya/core/green-line";

const CANONICAL = "https://app.aloya.cy/green-line";

export const Route = createFileRoute("/green-line")({
  head: () => ({
    meta: [
      { title: "The Green Line — Aloya" },
      {
        name: "description",
        content:
          "Aloya is the Republic of Cyprus bus network. Crossing the Green Line is named, not operated. What we know about Ledra, and what we do not.",
      },
      { property: "og:title", content: "The Green Line — Aloya" },
      {
        property: "og:description",
        content: "Republic buses only. The crossing exists. We do not run it.",
      },
      { property: "og:url", content: CANONICAL },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: GreenLinePage,
});

function GreenLinePage() {
  const { t } = useI18n();
  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-6">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="font-mono text-[12px] uppercase tracking-[0.18em] text-ink/60 hover:text-ink"
          >
            ← {t("common.back")}
          </Link>
          <LocaleSwitcher />
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-aegean">
          {t("gl.eyebrow")}
        </p>
        <h1 className="mt-2 font-display text-[42px] leading-[1.02] tracking-tight text-ink">
          {t("gl.title")}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink/80">{t("gl.lede")}</p>

        <section className="mt-6">
          <MapPreview
            height="h-48"
            center={{ lat: LEDRA_PEDESTRIAN.lat, lng: LEDRA_PEDESTRIAN.lng }}
            spanKm={0.8}
            markers={[
              {
                lat: LEDRA_PEDESTRIAN.lat,
                lng: LEDRA_PEDESTRIAN.lng,
                kind: "origin",
                label: LEDRA_PEDESTRIAN.name,
              },
            ]}
            fitToContent={false}
          />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {LEDRA_PEDESTRIAN.name} · {LEDRA_PEDESTRIAN.nameEl}
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink/45">
            {t("gl.know.label")}
          </h2>
          <dl className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
            <Fact title={t("gl.know.network.title")} body={t("gl.know.network.body")} />
            <Fact title={t("gl.know.ledra.title")} body={t("gl.know.ledra.body")} />
            <Fact title={t("gl.know.famagusta.title")} body={t("gl.know.famagusta.body")} />
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink/45">
            {t("gl.dont.label")}
          </h2>
          <dl className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
            <Fact title={t("gl.dont.hours.title")} body={t("gl.dont.hours.body")} />
            <Fact title={t("gl.dont.gtfs.title")} body={t("gl.dont.gtfs.body")} />
          </dl>
        </section>

        <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink/10 pt-6 text-[13px] text-ink/55">
          <Link to="/support" className="underline-offset-4 hover:text-ink hover:underline">
            Support →
          </Link>
          <a
            href="https://aloya.cy/green-line"
            className="underline-offset-4 hover:text-ink hover:underline"
          >
            aloya.cy →
          </a>
        </div>
      </main>
    </AppShell>
  );
}

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-6">
      <dt className="font-display text-[20px] leading-snug tracking-tight text-ink">{title}</dt>
      <dd className="mt-2 text-[15px] leading-relaxed text-ink/75">{body}</dd>
    </div>
  );
}
