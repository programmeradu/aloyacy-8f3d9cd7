import { Link, useRouterState } from "@tanstack/react-router";
import { IconCompass, IconRoute, IconOlive, IconTicket } from "./Icons";

const items = [
  { to: "/", label: "Explore", Icon: IconCompass },
  { to: "/trips", label: "Trips", Icon: IconRoute },
  { to: "/saved", label: "Saved", Icon: IconOlive },
  { to: "/wallet", label: "Pass", Icon: IconTicket },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-4 px-4">
      <div className="pointer-events-auto w-full max-w-[390px]">
        <div className="relative flex items-center justify-between rounded-full bg-white/85 px-2 py-2 ring-1 ring-line backdrop-blur-xl shadow-[0_12px_40px_-18px_rgba(28,30,26,0.25)]">
          {items.map(({ to, label, Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`relative flex flex-1 flex-col items-center gap-1 rounded-full py-2 transition-colors ${
                  active ? "text-aegean-deep" : "text-ink-soft"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-3 inset-y-0 -z-10 rounded-full bg-aegean-soft/40" />
                )}
                <Icon className="size-[18px]" strokeWidth={active ? 1.7 : 1.4} />
                <span className="font-mono text-[9px] uppercase tracking-[0.18em]">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
