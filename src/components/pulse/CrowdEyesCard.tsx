// C3 — name the lines with rider phones. Silent when we have none.
// A list, not a map: three dots on Cyprus would look like coverage.

import { RouteChip } from "@/components/RouteChip";
import type { CrowdEyesRoute } from "@/lib/crowd-coverage.server";
import type { Translate } from "@/components/pulse/TodayEditorial";

export function CrowdEyesCard({
  routes,
  t,
  kind = "watching",
}: {
  routes: CrowdEyesRoute[];
  t: Translate;
  kind?: "watching" | "seed";
}) {
  if (routes.length === 0) return null;
  const kicker = kind === "seed" ? t("pulse.seed.kicker") : t("pulse.eyes.kicker");
  const title = kind === "seed" ? t("pulse.seed.title") : t("pulse.eyes.title");
  const lede = kind === "seed" ? t("pulse.seed.lede") : t("pulse.eyes.lede");

  return (
    <article className="rounded-[28px] bg-card ring-1 ring-line px-5 py-5">
      <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {kicker}
      </p>
      <h2 className="mt-1 font-display text-[22px] leading-tight text-ink text-balance max-w-[16ch]">
        {title}
      </h2>
      <p className="mt-2 text-[13.5px] leading-snug text-ink-soft max-w-[36ch]">
        {lede}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {routes.map((r) => (
          <li key={r.routeId}>
            <RouteChip code={r.short} tone={r.tone} />
          </li>
        ))}
      </ul>
    </article>
  );
}
