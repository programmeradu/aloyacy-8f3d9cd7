// The Me sheet, opened from the avatar on every tab: alerts, offline
// timetables, accessibility, language, saved places, support, Green Line,
// guide and legal. Detail views reuse the existing feature cards unchanged.
import { useCallback, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { NotificationsCard } from "@/components/NotificationsCard";
import { OfflineSchedulesCard } from "@/components/OfflineSchedulesCard";
import { AccessibilityPrefsCard } from "@/components/AccessibilityPrefsCard";
import { useAuth } from "@/lib/useAuth";
import { LOCALES } from "@/lib/i18n";
import { useRoamI18n, type RoamKey } from "@/lib/roam-i18n";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { useMeSheetState } from "./me-store";
import { Avatar, photoOf } from "./Avatar";
import { GreekVoiceCredits } from "./GreekVoiceCredits";

type View = "list" | "alerts" | "offline" | "a11y" | "legal" | "credits";

function Row({
  icon,
  title,
  sub,
  onClick,
  to,
  right,
}: {
  icon: string;
  title: string;
  sub?: string;
  onClick?: () => void;
  to?: string;
  right?: ReactNode;
}) {
  const body = (
    <>
      <span className="r-me-ic">
        <Icon name={icon} />
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[16px] font-medium leading-tight">{title}</span>
        {sub ? <span className="r-lbl block mt-0.5 truncate">{sub}</span> : null}
      </span>
      {right ?? <Icon name="caret-right" size={16} style={{ color: "var(--r-mute)" }} />}
    </>
  );
  if (to)
    return (
      <Link to={to} className="r-row r-me-row">
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" className="r-row r-me-row w-full" onClick={onClick}>
        {body}
      </button>
    );
  return <div className="r-row r-me-row">{body}</div>;
}

export function MeSheet() {
  const [state, setState] = useMeSheetState();
  const [view, setView] = useState<View>("list");
  const { r, locale, setLocale } = useRoamI18n();
  const { user, isPermanent } = useAuth();
  const close = useCallback(() => {
    setState({ open: false });
    setTimeout(() => setView("list"), 400);
  }, [setState]);
  const active = (state.view as View | undefined) && view === "list" ? (state.view as View) : view;

  const name = isPermanent
    ? ((user?.user_metadata?.name as string | undefined) ??
      user?.email?.split("@")[0] ??
      r("me.guest"))
    : r("me.guest");
  const back = (
    <button
      type="button"
      className="r-pill r-pill--o"
      onClick={() => {
        setView("list");
        setState((s) => ({ ...s, view: undefined }));
      }}
    >
      <Icon name="caret-left" />
      {r("me.back")}
    </button>
  );
  const detail = (key: RoamKey, node: ReactNode) => (
    <div>
      <h2 className="r-t2 mb-4">{r(key)}</h2>
      {node}
    </div>
  );

  return (
    <Sheet
      open={state.open}
      onClose={close}
      label={r("me.open")}
      closeLabel={r("me.close")}
      full={active !== "list"}
      headLeft={active !== "list" ? back : undefined}
    >
      {active === "alerts" ? detail("me.alerts", <NotificationsCard />) : null}
      {active === "offline" ? detail("me.offline", <OfflineSchedulesCard />) : null}
      {active === "a11y" ? detail("me.a11y", <AccessibilityPrefsCard />) : null}
      {active === "legal"
        ? detail(
            "me.legal",
            <div className="r-me-group">
              <Row icon="shield-check" title={r("me.privacy")} to="/privacy" />
              <Row icon="file-text" title={r("me.terms")} to="/terms" />
              <Row
                icon="microphone"
                title={r("me.credits")}
                sub={r("me.creditsSub")}
                onClick={() => setView("credits")}
              />
            </div>,
          )
        : null}
      {active === "credits" ? detail("me.credits", <GreekVoiceCredits />) : null}
      {active === "list" ? (
        <div>
          <div className="flex items-center gap-4 pt-1 pb-5">
            <Avatar photo={isPermanent ? photoOf(user) : null} size={56} dark />
            <div className="min-w-0">
              <div className="text-[24px] font-medium leading-tight truncate">{name}</div>
              <div className="r-lbl mt-1">{r("me.sub")}</div>
            </div>
          </div>
          <div className="r-me-group">
            <Row
              icon="bell-simple"
              title={r("me.alerts")}
              sub={r("me.alertsSub")}
              onClick={() => setView("alerts")}
            />
            <Row
              icon="download-simple"
              title={r("me.offline")}
              sub={r("me.offlineSub")}
              onClick={() => setView("offline")}
            />
            <Row
              icon="wheelchair"
              title={r("me.a11y")}
              sub={r("me.a11ySub")}
              onClick={() => setView("a11y")}
            />
            <Row
              icon="translate"
              title={r("me.lang")}
              right={
                <span className="r-seg" role="group" aria-label={r("me.lang")}>
                  {LOCALES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      lang={l.code}
                      aria-label={l.label}
                      aria-pressed={locale === l.code}
                      onClick={() => setLocale(l.code)}
                    >
                      {l.code.toUpperCase()}
                    </button>
                  ))}
                </span>
              }
            />
          </div>
          <div className="r-me-group mt-4">
            <Row icon="bookmark-simple" title={r("me.saved")} sub={r("me.savedSub")} to="/saved" />
            <Row icon="lifebuoy" title={r("me.support")} to="/support" />
            <Row icon="map-trifold" title={r("me.green")} sub={r("me.greenSub")} to="/green-line" />
            <Row icon="signpost" title={r("me.guide")} to="/guide/getting-around-cyprus" />
            <Row icon="scales" title={r("me.legal")} onClick={() => setView("legal")} />
          </div>
          <div className="flex items-center justify-center gap-2 py-6 r-lbl">
            <img src="/icon-192.png" alt="" width={22} height={22} className="rounded-md" />
            {r("me.version")}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
