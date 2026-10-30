import type { Item } from "./types";

export type GroupKey = "search.saved" | "search.stops" | "search.lines" | "search.places" | "";

export function groupItems(items: Item[]) {
  const order: { title: GroupKey; kinds: Item["kind"][] }[] = [
    { title: "", kinds: ["plan"] },
    { title: "search.saved", kinds: ["saved"] },
    { title: "search.places", kinds: ["airport"] },
    { title: "search.stops", kinds: ["stop"] },
    { title: "search.lines", kinds: ["line"] },
  ];
  const lineFirst =
    items.findIndex((i) => i.kind === "line") < items.findIndex((i) => i.kind === "stop");
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
