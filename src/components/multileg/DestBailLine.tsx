import type { DictKey } from "@/lib/i18n";
import type { DestBail } from "@aloya/core/dest-bail";
import { cyClock } from "@aloya/core/cy-time";

export function DestBailLine({
  action,
  t,
}: {
  action: DestBail;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  let line = "";
  switch (action.kind) {
    case "walk":
      line = t("ml.destBail.walk", {
        dest: action.destLabel,
        min: action.walkMin,
        route: action.routeShort,
      });
      break;
    case "keepWait":
      if (action.chancePct != null && action.beforeUnix != null) {
        line =
          action.waitMin <= 0
            ? t("ml.destBail.keepWaitDueChance", {
                walk: action.walkMin,
                route: action.routeShort,
                pct: action.chancePct,
                time: cyClock(action.beforeUnix * 1000),
              })
            : t("ml.destBail.keepWaitChance", {
                walk: action.walkMin,
                route: action.routeShort,
                wait: action.waitMin,
                pct: action.chancePct,
                time: cyClock(action.beforeUnix * 1000),
              });
      } else {
        line =
          action.waitMin <= 0
            ? t("ml.destBail.keepWaitDue", { walk: action.walkMin, route: action.routeShort })
            : t("ml.destBail.keepWait", {
                walk: action.walkMin,
                route: action.routeShort,
                wait: action.waitMin,
              });
      }
      break;
    case "raptorWalk":
      line = t("ml.destBail.raptorWalk", {
        walk: action.walkMin,
        route: action.routeShort,
      });
      break;
    case "boltScooter":
      line = t("ml.destBail.boltScooter", {
        price: action.priceFrom,
        route: action.routeShort,
      });
      break;
    case "taxi":
      line = t("ml.destBail.taxi", {
        price: action.priceFrom,
        route: action.routeShort,
      });
      break;
  }
  return <p className="mt-2 text-[13px] leading-snug text-ink-soft">{line}</p>;
}
