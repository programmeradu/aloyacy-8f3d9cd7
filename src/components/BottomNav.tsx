import { Link, useRouterState } from "@tanstack/react-router";
import { IconCompass, IconRoute, IconWaves, IconOlive, IconTicket } from "./Icons";
import { useI18n, type DictKey } from "@/lib/i18n";

const items = [
  { to: "/", labelKey: "nav.explore" as DictKey, Icon: IconCompass },
  { to: "/trips", labelKey: "nav.trips" as DictKey, Icon: IconRoute },
  { to: "/pulse", labelKey: "nav.pulse" as DictKey, Icon: IconWaves },
  { to: "/saved", labelKey: "nav.saved" as DictKey, Icon: IconOlive },
  { to: "/wallet", labelKey: "nav.pass" as DictKey, Icon: IconTicket },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useI18n();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(env(safe-area-inset-bottom),12px)] px-3">
      <div className="pointer-events-auto w-full max-w-[400px]">
        <div className="relative flex items-center justify-between rounded-[28px] bg-white px-2 py-2 ring-1 ring-line shadow-[0_18px_40px_-14px_rgba(28,30,26,0.35),0_2px_6px_-2px_rgba(28,30,26,0.12)]">
          {items.map(({ to, labelKey, Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`relative flex flex-1 min-w-0 flex-col items-center gap-1 rounded-[22px] py-2 transition-colors ${
                  active ? "text-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-1.5 inset-y-0 -z-10 rounded-[22px] bg-limestone-soft ring-1 ring-line" />
                )}
                <Icon className="size-[20px]" strokeWidth={active ? 1.9 : 1.6} />
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] [:lang(el)_&]:tracking-[0.01em] max-w-full truncate-1">
                  {t(labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
