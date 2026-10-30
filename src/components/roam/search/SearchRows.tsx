// Rows and groups for the Roam search sheet.
import type React from "react";
import { useRoamI18n } from "@/lib/roam-i18n";
import { Icon } from "../Icon";
import type { Item } from "./types";

type GroupKey = "search.saved" | "search.stops" | "search.lines" | "search.places" | "";

export function groupItems(items: Item[]) {
  const order: { title: GroupKey; kinds: Item["kind"][] }[] = [
    { title: "", kinds: ["plan"] },
    { title: "search.saved", kinds: ["saved"] },
    { title: "search.places", kinds: ["airport"] },
    { title: "search.stops", kinds: ["stop"] },
    { title: "search.lines", kinds: ["line"] },
  ];
  const lineFirst = items.findIndex((i) => i.kind === "line") < items.findIndex((i) => i.kind === "stop");
  if (lineFirst) order.splice(3, 2, order[4], order[3]);
  const groups = order
    .map((o) => ({ title: o.title, items: items.filter((i) => o.kinds.includes(i.kind)) }))
    .filter((g) => g.items.length > 0);
  const geo = items.filter((i) => i.kind === "place");
  if (geo.length) {
    const ap = groups.find((g) => g.title === "search.places");
    if (ap) ap.items.push(...geo);
    else groups.push({ title: "search.places", items: geo });
  }
  return groups;
}

export function Group({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="r-search-group">
      {title ? (
        <div className="r-search-gh">
          <h3>{title}</h3>
          {action}
        </div>
      ) : null}
      <div className="r-search-card">{children}</div>
    </section>
  );
}

export function Row({
  icon,
  title,
  sub,
  meta,
  badge,
  onClick,
}: {
  icon?: string;
  title: string;
  sub?: string;
  meta?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="r-row r-search-row" onClick={onClick}>
      {badge ? (
        <span className="r-search-badge">{badge}</span>
      ) : (
        <span className="r-icobox">
          <Icon name={icon ?? "map-pin"} />
        </span>
      )}
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[16px] font-medium leading-tight truncate">{title}</span>
        {sub ? <span className="r-lbl block mt-0.5 truncate">{sub}</span> : null}
      </span>
      {meta ? <span className="r-lbl r-tnum shrink-0">{meta}</span> : null}
    </button>
  );
}

export function ItemRow({ it, planning, onChoose }: { it: Item; planning: boolean; onChoose: (i: Item) => void }) {
  const { r, locale } = useRoamI18n();
  if (it.kind === "plan") {
    const when = it.intent.leaveAtISO
      ? new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Nicosia",
        }).format(new Date(it.intent.leaveAtISO))
      : null;
    const place = it.dest?.label ?? it.intent.to;
    return (
      <button type="button" className="r-search-plan" onClick={() => onChoose(it)} disabled={planning}>
        <span className="r-search-plan-top">
          <span className="r-search-plan-ic">
            <Icon name={planning ? "circle-notch" : "path"} className={planning ? "animate-spin" : undefined} />
          </span>
          <span className="flex-1 min-w-0 text-left">
            <span className="block text-[17px] font-medium">{planning ? r("search.planning") : r("search.plan")}</span>
          </span>
          <Icon name="arrow-right" />
        </span>
        <span className="r-search-plan-chips">
          {place ? <span className="r-pill r-pill--y">{r("search.toX", { place: titleCase(place) })}</span> : null}
          {it.intent.edge === "last" ? <span className="r-pill">{r("search.lastBus")}</span> : null}
          {it.intent.edge === "first" ? <span className="r-pill">{r("search.firstBus")}</span> : null}
          {when ? <span className="r-pill r-tnum">{when}</span> : null}
          <span className="r-pill">{r("search.fromHere")}</span>
        </span>
      </button>
    );
  }
  if (it.kind === "stop")
    return (
      <Row
        icon="bus"
        title={it.name}
        meta={it.km != null && it.km > 0 ? (it.km < 1 ? `${Math.round(it.km * 1000)} m` : r("search.away", { km: it.km.toFixed(1) })) : undefined}
        onClick={() => onChoose(it)}
      />
    );
  if (it.kind === "line") return <Row badge={it.code} title={it.name.replace(/\s+-\s+/g, ", ")} onClick={() => onChoose(it)} />;
  if (it.kind === "saved") return <Row icon="bookmark-simple" title={it.label} sub={it.sub} onClick={() => onChoose(it)} />;
  if (it.kind === "airport") return <Row icon="airplane-tilt" title={it.name} sub={it.city} onClick={() => onChoose(it)} />;
  return <Row icon="map-pin" title={it.name} sub={it.sub} onClick={() => onChoose(it)} />;
}

function titleCase(s: string) {
  return s.replace(/\b([a-z\u03b1-\u03c9])/g, (m) => m.toUpperCase());
}
