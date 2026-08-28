// C3 — name the lines with rider phones. Silent when we have none.
// A list, not a map: three dots on Cyprus would look like coverage.

import { RouteChip } from "@/components/RouteChip";
import type { CrowdEyesRoute } from "@/lib/crowd-coverage.server";
import type { Translate } from "@/components/pulse/TodayEditorial";

export function CrowdEyesCard({
  routes,
  t,
}: {
  routes: CrowdEyesRoute[];
  t: Translate;
}) {
  if (routes.length === 0) return null;

  return (
    <article className="rounded-[28px] bg-card ring-1 ring-line px-5 py-5">
      <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {t("pulse.eyes.kicker")}
      </p>
      <h2 className="mt-1 font-display text-[22px] leading-tight text-ink text-balance max-w-[16ch]">
        {t("pulse.eyes.title")}
      </h2>
      <p className="mt-2 text-[13.5px] leading-snug text-ink-soft max-w-[36ch]">
        {t("pulse.eyes.lede")}
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
