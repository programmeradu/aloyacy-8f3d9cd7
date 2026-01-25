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
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-4 px-4">
      <div className="pointer-events-auto w-full max-w-[400px]">
        <div className="relative flex items-center justify-between rounded-full bg-white/85 px-1.5 py-2 ring-1 ring-line backdrop-blur-xl shadow-[0_12px_40px_-18px_rgba(28,30,26,0.25)]">
          {items.map(({ to, labelKey, Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`relative flex flex-1 min-w-0 flex-col items-center gap-1 rounded-full py-2 transition-colors ${
                  active ? "text-aegean-deep" : "text-ink-soft"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-2 inset-y-0 -z-10 rounded-full bg-aegean-soft/40" />
                )}
                <Icon className="size-[18px]" strokeWidth={active ? 1.7 : 1.4} />
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] [:lang(el)_&]:tracking-[0.04em] max-w-full truncate-1 px-1">
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
