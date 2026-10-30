// The next-bus glass card and its designed states: bus (live / estimated /
// scheduled), loading skeleton, no location, no service, error.

import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Ph } from "./SkyIcons";
import { HomeRemindButton } from "./HomeRemindButton";
import { badgeInk, fmtCyprusTime, type CardState, type NextBus } from "./sky-state";

type Props = {
  state: CardState;
  picked: boolean;
  origin: { lat: number; lng: number; label: string };
  onAllowLocation: () => void;
  onPickStop: () => void;
  onRetry: () => void;
};

export function NextBusCard(p: Props) {
  const s = p.state;
  if (s.kind === "bus")
    return <BusCard bus={s.bus} picked={p.picked} origin={p.origin} onPickStop={p.onPickStop} />;
  if (s.kind === "loading") return <SkeletonCard />;
  if (s.kind === "no-location")
    return <NoLocationCard denied={s.denied} onAllow={p.onAllowLocation} onPick={p.onPickStop} />;
  if (s.kind === "none")
    return <NoServiceCard stopId={s.stopId} stopName={s.stopName} onPick={p.onPickStop} />;
  return <ErrorCard onRetry={p.onRetry} />;
}

function BusCard({
  bus,
  picked,
  origin,
  onPickStop,
}: {
  bus: NextBus;
  picked: boolean;
  origin: Props["origin"];
  onPickStop: () => void;
}) {
  const { t } = useI18n();
  const eta = bus.etaMin <= 0 ? t("sky.card.now") : `${bus.etaMin} ${t("sky.card.min")}`;
  const ink = badgeInk(bus.color);
  return (
    <section
      className="g dk sky-card"
      aria-label={t("sky.card.aria", { line: bus.line, dest: bus.dest, eta, stop: bus.stopName })}
    >
      <div className="sky-r1">
        <Link to="/stop/$stopId" params={{ stopId: bus.stopId }} className="sky-stop">
          <Ph name="walk" size={17} style={{ flex: "none" }} />
          <b>{bus.stopName}</b>
          {bus.walkMin != null ? <span>· {t("sky.card.walk", { n: bus.walkMin })}</span> : null}
        </Link>
        {bus.backing === "live" ? (
          <div className="sky-badge live">
            <i />
            {t("sky.card.live")}
          </div>
        ) : (
          <div className="sky-badge sched">
            <i />
            {bus.backing === "estimated" ? t("sky.card.estimated") : t("sky.card.scheduled")}
          </div>
        )}
      </div>

      <Link
        to="/stop/$stopId"
        params={{ stopId: bus.stopId }}
        className="sky-big"
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="sky-mn tnum">
          {bus.etaMin <= 0 ? (
            <b className="word">{t("sky.card.now")}</b>
          ) : (
            <>
              <b>{bus.etaMin}</b>
              <em>{t("sky.card.min")}</em>
            </>
          )}
        </div>
        <div className="sky-to">
          <span className="sky-ln" style={{ background: bus.color, color: ink }}>
            {bus.line}
          </span>
          <strong>{bus.dest}</strong>
          {bus.via ? <small>{t("sky.card.via", { via: bus.via })}</small> : null}
        </div>
      </Link>

      {bus.stopsAway != null ? <Progress bus={bus} /> : null}

      <div className="sky-thn">
        {bus.then.length > 0 ? (
          <>
            <span>{t("sky.card.then")}</span>
            {bus.then.map((u) => (
              <div key={u} className="sky-tm tnum">
                {fmtCyprusTime(u)}
              </div>
            ))}
          </>
        ) : picked ? (
          <button type="button" className="sky-change" onClick={onPickStop}>
            {t("sky.card.change")}
          </button>
        ) : null}
        <HomeRemindButton bus={bus} origin={origin} />
      </div>
    </section>
  );
}

/** Only rendered when a live vehicle position backs `stopsAway`. */
function Progress({ bus }: { bus: NextBus }) {
  const { t } = useI18n();
  const n = bus.stopsAway ?? 0;
  // Bus marker sits where the remaining stops begin; upcoming stops are spread
  // evenly between it and the rider. Two dimmed ticks behind the bus mark the
  // road it has already covered.
  const shown = Math.min(n, 6);
  const busPct = 38;
  const dots = Array.from(
    { length: Math.max(0, shown - 1) },
    (_, i) => busPct + ((100 - busPct) * (i + 1)) / shown,
  );
  return (
    <div className="sky-prog">
      <div className="sky-pl tnum">
        <span>
          <b>{n === 1 ? t("sky.card.stop1") : t("sky.card.stops", { n })}</b> {t("sky.card.away")}
        </span>
        <span>
          {t("sky.card.arrives")} <b>{fmtCyprusTime(bus.arrivalUnix)}</b>
        </span>
      </div>
      <div className="sky-trk" aria-hidden="true">
        <div className="l0" />
        <div
          className="l1"
          style={{
            left: `${busPct}%`,
            background: `linear-gradient(90deg, ${bus.color}, ${bus.color}cc)`,
          }}
        />
        <div className="d p" style={{ left: "6%" }} />
        <div className="d p" style={{ left: "20%" }} />
        {dots.map((l) => (
          <div key={l} className="d" style={{ left: `${l}%` }} />
        ))}
        <div
          className="bus"
          style={{
            left: `${busPct}%`,
            background: bus.color,
            color: badgeInk(bus.color),
            boxShadow: `0 0 0 3px ${bus.color}47, 0 2px 6px rgba(0,0,0,.35)`,
          }}
        >
          <Ph name="bus" size={13} />
        </div>
        <div className="me">
          <i />
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  const { t } = useI18n();
  return (
    <section className="g dk sky-card" aria-busy="true" aria-label={t("sky.loadingAria")}>
      <div className="sky-r1">
        <div className="sky-sk" style={{ width: 168, height: 16 }} />
        <div className="sky-sk" style={{ width: 52, height: 14 }} />
      </div>
      <div className="sky-big">
        <div className="sky-sk" style={{ width: 120, height: 66, borderRadius: 14 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div className="sky-sk" style={{ width: 44, height: 24, borderRadius: 7 }} />
          <div className="sky-sk" style={{ width: 132, height: 20 }} />
          <div className="sky-sk" style={{ width: 96, height: 14 }} />
        </div>
      </div>
      <div className="sky-thn">
        <div className="sky-sk" style={{ width: 58, height: 32, borderRadius: 12 }} />
        <div className="sky-sk" style={{ width: 58, height: 32, borderRadius: 12 }} />
        <div
          className="sky-sk"
          style={{ width: 132, height: 40, borderRadius: 20, marginLeft: "auto" }}
        />
      </div>
    </section>
  );
}

function StateCard({
  icon,
  title,
  body,
  children,
}: {
  icon: Parameters<typeof Ph>[0]["name"];
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <section className="g dk sky-card">
      <div className="sky-ico">
        <Ph name={icon} size={24} />
      </div>
      <h2>{title}</h2>
      <p className="body">{body}</p>
      <div className="acts">{children}</div>
    </section>
  );
}

function NoLocationCard({
  denied,
  onAllow,
  onPick,
}: {
  denied: boolean;
  onAllow: () => void;
  onPick: () => void;
}) {
  const { t } = useI18n();
  return (
    <StateCard
      icon="crosshair"
      title={t("sky.loc.title")}
      body={denied ? t("sky.loc.denied") : t("sky.loc.body")}
    >
      {!denied ? (
        <button type="button" className="sky-btn inline" onClick={onAllow}>
          <Ph name="crosshair" size={18} />
          {t("sky.loc.allow")}
        </button>
      ) : null}
      <button type="button" className={`sky-btn inline${denied ? "" : " ghost"}`} onClick={onPick}>
        <Ph name="pin" size={18} />
        {t("sky.loc.pick")}
      </button>
    </StateCard>
  );
}

function NoServiceCard({
  stopId,
  stopName,
  onPick,
}: {
  stopId: string | null;
  stopName: string | null;
  onPick: () => void;
}) {
  const { t } = useI18n();
  return (
    <StateCard
      icon="moonStars"
      title={t("sky.none.title")}
      body={t("sky.none.body", { stop: stopName ?? "-" })}
    >
      <Link to="/trips" className="sky-btn inline">
        <Ph name="map" size={18} />
        {t("sky.none.plan")}
      </Link>
      {stopId ? (
        <Link to="/stop/$stopId" params={{ stopId }} className="sky-btn inline ghost">
          <Ph name="bus" size={18} />
          {t("sky.remind.stopTimes")}
        </Link>
      ) : (
        <button type="button" className="sky-btn inline ghost" onClick={onPick}>
          <Ph name="pin" size={18} />
          {t("sky.loc.pick")}
        </button>
      )}
    </StateCard>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <StateCard icon="warn" title={t("sky.err.title")} body={t("sky.err.body")}>
      <button type="button" className="sky-btn inline" onClick={onRetry}>
        <Ph name="retry" size={18} />
        {t("sky.err.retry")}
      </button>
      <Link to="/trips" className="sky-btn inline ghost">
        <Ph name="map" size={18} />
        {t("sky.none.plan")}
      </Link>
    </StateCard>
  );
}
