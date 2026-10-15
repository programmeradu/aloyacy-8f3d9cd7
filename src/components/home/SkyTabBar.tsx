// Floating glass tab bar for the Sky Clock home. Same five destinations as
// BottomNav (Explore /, Trips /trips, Pulse /pulse, Saved /saved, Pass /wallet).

import { Link, useRouterState } from "@tanstack/react-router";
import { useI18n, type DictKey } from "@/lib/i18n";
import { Ph, type PhName } from "./SkyIcons";

const TABS: {
  to: "/" | "/trips" | "/pulse" | "/saved" | "/wallet";
  label: DictKey;
  icon: PhName;
}[] = [
  { to: "/", label: "nav.explore", icon: "compass" },
  { to: "/trips", label: "nav.trips", icon: "map" },
  { to: "/pulse", label: "nav.pulse", icon: "pulse" },
  { to: "/saved", label: "nav.saved", icon: "bookmark" },
  { to: "/wallet", label: "nav.pass", icon: "ticket" },
];

export function SkyTabBar() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <div className="sky-scrim" aria-hidden="true" />
      <nav className="g sky-tab" aria-label={t("sky.tabsAria")}>
        {TABS.map((tab) => {
          const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
          return (
            <Link key={tab.to} to={tab.to} aria-current={active ? "page" : undefined}>
              <Ph name={tab.icon} size={26} />
              <span>{t(tab.label)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
