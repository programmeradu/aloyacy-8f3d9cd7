import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — Aloya" },
      {
        name: "description",
        content:
          "How Aloya collects, stores, and protects your travel data on Cyprus buses.",
      },
      { property: "og:title", content: "Privacy — Aloya" },
      {
        property: "og:description",
        content: "What we store, who we share with, and your rights.",
      },
      { property: "og:url", content: "https://aloyacy.lovable.app/privacy" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://aloyacy.lovable.app/og/og-privacy.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Cypriot limestone wall split by a shaft of aegean-blue light." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://aloyacy.lovable.app/og/og-privacy.jpg" },
    ],
    links: [
      { rel: "canonical", href: "https://aloyacy.lovable.app/privacy" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useI18n();
  const updated = "2026-06-08";
  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-6">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="text-[12px] font-mono uppercase tracking-[0.18em] text-ink/60 hover:text-ink"
          >
            ← {t("common.back")}
          </Link>
          <LocaleSwitcher />
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-aegean">
          {t("privacy.eyebrow")}
        </p>
        <h1 className="mt-2 font-display text-[42px] leading-[1.02] tracking-tight text-ink">
          {t("privacy.title")}
        </h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/45">
          {t("privacy.updated", { date: updated })}
        </p>

        <p className="mt-8 text-[15px] leading-relaxed text-ink/80">
          {t("privacy.intro")}
        </p>

        <Section title={t("privacy.section.data")} body={t("privacy.data.body")} />
        <Section title={t("privacy.section.account")} body={t("privacy.account.body")} />
        <Section title={t("privacy.section.sharing")} body={t("privacy.sharing.body")} />
        <Section title={t("privacy.section.rights")} body={t("privacy.rights.body")} />
        <Section title={t("privacy.section.contact")} body={t("privacy.contact.body")} />

        <div className="mt-12 border-t border-ink/10 pt-6 text-[13px] text-ink/55">
          <Link to="/terms" className="underline-offset-4 hover:text-ink hover:underline">
            {t("terms.title")} →
          </Link>
        </div>
      </main>
    </AppShell>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-[22px] leading-tight tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-ink/75">{body}</p>
    </section>
  );
}
