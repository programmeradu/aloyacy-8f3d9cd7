// C3: name the lines with rider phones (or the busy lines nobody can see yet).
// Silent when we have none. A list, not a map: three dots on Cyprus would look
// like coverage. One chip per line (the feed lists each direction and variant
// as its own route), marked with the line's own colour from the timetable.
import type { CSSProperties } from "react";
import type { CrowdEyesRoute } from "@/lib/crowd-coverage.server";
import type { Translate } from "@/components/pulse/TodayEditorial";
import { getRoute } from "@/lib/gtfs";

function lineColour(routeId: string): string {
  const c = (getRoute(routeId)?.color ?? "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(c) || /^f{6}$/i.test(c)) return "#8F8F8A";
  return `#${c}`;
}

/** A line label as riders say it: numbers as they are, capitals in sentence case. */
export function lineLabel(short: string): string {
  const s = (short ?? "").trim();
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3 || letters !== letters.toLocaleUpperCase()) return s;
  const low = s.toLocaleLowerCase();
  return low.charAt(0).toLocaleUpperCase() + low.slice(1);
}

/** Dedupe key for a line chip: the label a rider reads. */
export function lineKey(short: string): string {
  return lineLabel(short).toLocaleLowerCase().replace(/\s+/g, "");
}

export function CrowdEyesCard({
  routes,
  t,
  kind = "watching",
  exclude,
}: {
  routes: CrowdEyesRoute[];
  t: Translate;
  kind?: "watching" | "seed";
  /** Line keys already shown in another card. */
  exclude?: ReadonlySet<string>;
}) {
  const seen = new Set<string>(exclude ?? []);
  const lines: CrowdEyesRoute[] = [];
  for (const r of routes) {
    const key = lineKey(r.short);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(r);
  }
  if (lines.length === 0) return null;
  const kicker = kind === "seed" ? t("pulse.seed.kicker") : t("pulse.eyes.kicker");
  const title = kind === "seed" ? t("pulse.seed.title") : t("pulse.eyes.title");
  const lede = kind === "seed" ? t("pulse.seed.lede") : t("pulse.eyes.lede");

  return (
    <article className="r-pulse-card" data-kind={kind}>
      <p className="r-pulse-kick">
        <i aria-hidden="true" />
        {kicker}
      </p>
      <h3 className="r-pulse-title">{title}</h3>
      <p className="r-pulse-lede">{lede}</p>
      <ul className="r-pulse-lines">
        {lines.map((r) => (
          <li key={r.routeId}>
            <span className="r-opchip" style={{ "--op": lineColour(r.routeId) } as CSSProperties}>
              <i aria-hidden="true" />
              {lineLabel(r.short)}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
