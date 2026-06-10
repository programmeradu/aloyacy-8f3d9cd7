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
        <div className="relative flex items-center justify-between rounded-[28px] bg-ink px-2 py-2 ring-1 ring-ink shadow-[0_18px_50px_-12px_rgba(28,30,26,0.55)]">
          {items.map(({ to, labelKey, Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`relative flex flex-1 min-w-0 flex-col items-center gap-1 rounded-[22px] py-2 transition-colors ${
                  active ? "text-ink" : "text-limestone/70 hover:text-limestone"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-1.5 inset-y-0 -z-10 rounded-[22px] bg-limestone shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5)]" />
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
