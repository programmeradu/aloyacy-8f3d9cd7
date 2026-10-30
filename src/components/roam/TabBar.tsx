// Floating pill tab bar: Now, Go, Lines, Pulse, Pass. Dark frosted over the
// map (Now, live screens), white on the canvas. Respects the home indicator.
import { Link, useRouterState } from "@tanstack/react-router";
import { useRoamI18n, type RoamKey } from "@/lib/roam-i18n";
import { Icon } from "./Icon";

const TABS: { to: string; key: RoamKey; icon: string; match: (p: string) => boolean }[] = [
  {
    to: "/",
    key: "tab.now",
    icon: "compass",
    match: (p) => p === "/" || p.startsWith("/saved") || p.startsWith("/stop/"),
  },
  {
    to: "/trips",
    key: "tab.go",
    icon: "path",
    match: (p) => p.startsWith("/trips") || p.startsWith("/plan/") || p.startsWith("/airport"),
  },
  {
    to: "/lines",
    key: "tab.lines",
    icon: "bus",
    match: (p) => p.startsWith("/lines") || p.startsWith("/route/"),
  },
  { to: "/pulse", key: "tab.pulse", icon: "pulse", match: (p) => p.startsWith("/pulse") },
  {
    to: "/wallet",
    key: "tab.pass",
    icon: "wallet",
    match: (p) => p.startsWith("/wallet") || p.startsWith("/pass"),
  },
];

export function TabBar({ dark = false }: { dark?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { r } = useRoamI18n();
  return (
    <nav className="r-tabs-wrap roam" aria-label={r("tab.aria")}>
      <div className={`r-tabs ${dark ? "r-tabs--dark" : "r-tabs--light"}`}>
        {TABS.map((t) => {
          const on = t.match(pathname);
          return (
            <Link key={t.to} to={t.to} className="r-tab" aria-current={on ? "page" : undefined}>
              <span className="c">
                <Icon name={t.icon} />
              </span>
              <span>{r(t.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
