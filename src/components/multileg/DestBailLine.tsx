import type { DictKey } from "@/lib/i18n";
import type { DestBail } from "@aloya/core/dest-bail";
import { cyClock } from "@aloya/core/cy-time";
import { cleanPlace, ProviderTile } from "@/components/mobility/MobilityCard";
import { boltAppLink } from "@/lib/mobility-links";

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
        dest: cleanPlace(action.destLabel),
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
      if (action.destLabel && action.driveMin != null && action.waitMin != null) {
        line =
          action.waitMin <= 0
            ? t("ml.destBail.taxiDoorDue", {
                dest: cleanPlace(action.destLabel),
                drive: action.driveMin,
                price: action.priceFrom,
                route: action.routeShort,
              })
            : t("ml.destBail.taxiDoor", {
                dest: cleanPlace(action.destLabel),
                drive: action.driveMin,
                price: action.priceFrom,
                route: action.routeShort,
                wait: action.waitMin,
              });
      } else {
        line = t("ml.destBail.taxi", {
          price: action.priceFrom,
          route: action.routeShort,
        });
      }
      break;
  }
  if (action.kind === "boltScooter") {
    // Same provider pattern as the Go cards: real logo tile, one tap opens Bolt.
    return (
      <a
        href={boltAppLink("scooter")}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center gap-3 rounded-[18px] bg-[var(--r-pill,#eeeeea)] p-2.5 pr-3.5 text-[13px] leading-snug text-[#171717]"
      >
        <ProviderTile provider="bolt" size={32} />
        <span className="min-w-0 flex-1">{line}</span>
        <i className="ph ph-arrow-up-right shrink-0 text-[16px]" aria-hidden />
      </a>
    );
  }
  if (action.kind === "taxi") {
    return (
      <p className="mt-3 flex items-center gap-3 rounded-[18px] bg-[var(--r-pill,#eeeeea)] p-2.5 pr-3.5 text-[13px] leading-snug text-[#171717]">
        <ProviderTile provider="taxi" size={32} />
        <span className="min-w-0 flex-1">{line}</span>
      </p>
    );
  }
  return <p className="mt-2 text-[13px] leading-snug text-ink-soft">{line}</p>;
}
