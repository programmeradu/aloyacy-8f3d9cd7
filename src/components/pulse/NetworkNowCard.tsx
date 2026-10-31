// Network now: live punctuality at a glance. A ring splits the tracked buses
// into on time, delayed and early; the column beside it gives the counts, a
// sparkline traces today's average delay by hour, and each city gets its own
// tile. Same numbers as the Live network tiles (useNetworkNow).
import { useCallback, useEffect, useState } from "react";
import type { CityKey, NetworkNow } from "@/lib/network-now";
import type { HourBucket } from "@/lib/pulse.functions";
import { useRoamI18n, type RoamKey } from "@/lib/roam-i18n";

const CITY: Record<CityKey, RoamKey> = {
  NPT: "pulse.nn.nicosia",
  LMS: "pulse.nn.limassol",
  LCA: "pulse.nn.larnaca",
  PFO: "pulse.nn.paphos",
  FAM: "pulse.nn.famagusta",
  IC: "pulse.nn.intercity",
};

const LATE = "#F2865E";
const EARLY = "rgba(255,255,255,.42)";

export function cityTone(p: number | null): "good" | "fair" | "poor" | "idle" {
  if (p === null) return "idle";
  if (p >= 55) return "good";
  if (p >= 30) return "fair";
  return "poor";
}

function signedMin(sec: number) {
  const m = Math.round(sec / 60);
  return m > 0 ? `+${m}` : String(m);
}

function Ring({ onTime, late, early }: { onTime: number; late: number; early: number }) {
  const R = 47;
  const C = 2 * Math.PI * R;
  const segs = [
    { v: onTime, c: "url(#r-nn-g)", glow: true },
    { v: late, c: LATE, glow: false },
    { v: early, c: EARLY, glow: false },
  ].filter((s) => s.v > 0);
  const gap = segs.length > 1 ? 4 : 0;
  let off = 0;
  return (
    <svg width="116" height="116" viewBox="0 0 116 116" aria-hidden="true">
      <defs>
        <linearGradient id="r-nn-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD889" />
          <stop offset="1" stopColor="#F6B83C" />
        </linearGradient>
        <filter id="r-nn-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      <circle cx="58" cy="58" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="10" />
      <circle cx="58" cy="58" r={R - 11} fill="rgba(255,255,255,.03)" />
      <g transform="rotate(-90 58 58)">
        {segs.map((s, i) => {
          const full = (s.v / 100) * C;
          const len = Math.max(0.5, full - gap);
          const dash = `${len} ${C}`;
          const el = (
            <g key={i}>
              {s.glow ? (
                <circle
                  cx="58"
                  cy="58"
                  r={R}
                  fill="none"
                  stroke="#F6B83C"
                  strokeOpacity=".55"
                  strokeWidth="10"
                  strokeDasharray={dash}
                  strokeDashoffset={-off}
                  filter="url(#r-nn-glow)"
                />
              ) : null}
              <circle
                cx="58"
                cy="58"
                r={R}
                fill="none"
                stroke={s.c}
                strokeWidth="10"
                strokeDasharray={dash}
                strokeDashoffset={-off}
              />
            </g>
          );
          off += full;
          return el;
        })}
      </g>
    </svg>
  );
}

function Spark({ buckets, nowHour }: { buckets: HourBucket[]; nowHour: number | null }) {
  const { r } = useRoamI18n();
  if (nowHour === null) return null;
  const pts = buckets
    .filter((b) => b.hour >= 5 && b.hour <= nowHour && b.sampleCount >= 100)
    .map((b) => ({ h: b.hour, m: b.meanDelaySec / 60 }));
  if (pts.length < 3) return null;
  const W = 320;
  const H = 34;
  const h0 = pts[0].h;
  const h1 = Math.max(pts[pts.length - 1].h, h0 + 1);
  const lo = Math.min(-1, ...pts.map((p) => p.m));
  const hi = Math.max(6, ...pts.map((p) => p.m));
  const X = (h: number) => 4 + ((h - h0) / (h1 - h0)) * (W - 12);
  const Y = (m: number) => 5 + (1 - (m - lo) / (hi - lo)) * (H - 10);
  const xy = pts.map((p) => [X(p.h), Y(p.m)] as const);
  let d = `M${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
  for (let i = 1; i < xy.length; i++) {
    const [x0, y0] = xy[i - 1];
    const [x1, y1] = xy[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)} ${y0.toFixed(1)} ${cx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  const last = xy[xy.length - 1];
  const area = `${d} L${last[0].toFixed(1)} ${H} L${xy[0][0].toFixed(1)} ${H} Z`;
  const y0 = Y(0);
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <div className="r-nn-spark">
      <div className="r-nn-sparkhead">
        <span>{r("pulse.nn.byHour")}</span>
        <b>
          {signedMin(pts[pts.length - 1].m * 60)} {r("pulse.nn.minShort")}
        </b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="r-nn-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F6B83C" stopOpacity=".32" />
            <stop offset="1" stopColor="#F6B83C" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y0} y2={y0} stroke="rgba(255,255,255,.14)" strokeDasharray="2 4" />
        <path d={area} fill="url(#r-nn-area)" />
        <path d={d} fill="none" stroke="#F6B83C" strokeWidth="2" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r="7" fill="#F6B83C" fillOpacity=".22" />
        <circle
          cx={last[0]}
          cy={last[1]}
          r="3.4"
          fill="#F6B83C"
          stroke="#232322"
          strokeWidth="1.5"
        />
      </svg>
      <div className="r-nn-axis">
        <span>{pad(h0)}</span>
        <span>{r("pulse.nn.now")}</span>
      </div>
    </div>
  );
}

function Texture() {
  return (
    <svg
      className="r-nn-tex"
      viewBox="0 0 360 440"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g fill="none" stroke="rgba(255,255,255,.045)" strokeWidth="1">
        <path d="M-10 70 C 80 44, 170 96, 380 52" />
        <path d="M-10 182 C 120 160, 220 222, 380 170" />
        <path d="M58 -10 C 70 120, 26 270, 72 450" />
        <path d="M262 -10 C 236 150, 306 270, 258 450" />
        <path d="M-10 344 C 100 318, 240 370, 380 318" />
        <path d="M160 -10 C 172 90, 140 200, 180 450" />
      </g>
    </svg>
  );
}

const OPEN_KEY = "aloya:pulse-network-open";

function SumRing({ pct, rated }: { pct: number; rated: boolean }) {
  const R = 25;
  const C = 2 * Math.PI * R;
  const v = rated ? Math.max(0, Math.min(100, pct)) : 0;
  return (
    <span className="r-nn-sumring">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke="#F6B83C"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * C} ${C}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <b>
        {rated ? pct : "-"}
        {rated ? <small>%</small> : null}
      </b>
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className="r-nn-chev" data-open={open ? "true" : "false"} aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14">
        <path
          d="M3 5.2 7 9l4-3.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function NetworkNowCard({
  now,
  buckets,
  nowHour,
}: {
  now: NetworkNow | null;
  buckets: HourBucket[];
  nowHour: number | null;
}) {
  const { r } = useRoamI18n();
  // Collapsed by default (the compact widget); the rider's last choice wins.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === "1");
    } catch {
      /* private mode: stay collapsed */
    }
  }, []);
  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const ready = !!now && now.liveBuses > 0;
  const rated = ready && now!.tracked > 0;
  const worst =
    ready && rated
      ? now!.cities
          .filter((c) => c.onTimePct !== null && c.tracked >= 5)
          .sort((a, b) => (a.onTimePct ?? 0) - (b.onTimePct ?? 0))[0]
      : undefined;

  return (
    <section
      className="r-nn r-rise"
      data-open={open ? "true" : "false"}
      aria-label={r("pulse.networkNow")}
    >
      <Texture />
      <button
        type="button"
        className="r-nn-top r-nn-btn"
        data-netnow-toggle=""
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? r("pulse.nn.collapse") : r("pulse.nn.expand")}
      >
        <span className="r-nn-lbl">{r("pulse.networkNow")}</span>
        <span className="r-nn-topr">
          {ready ? (
            <span className="r-nn-live" data-metric="nn-live">
              <i aria-hidden="true" />
              {r("pulse.nn.live", { n: now!.liveBuses })}
            </span>
          ) : null}
          <Chevron open={open} />
        </span>
      </button>

      {!now ? (
        <p className="r-nn-empty">{r("pulse.learning")}</p>
      ) : !ready ? (
        <p className="r-nn-empty">{r("pulse.nn.quiet")}</p>
      ) : (
        <>
          <div className="r-nn-fold" data-open={open ? "false" : "true"} aria-hidden={open}>
            <div>
              <button
                type="button"
                className="r-nn-sum r-nn-btn"
                onClick={toggle}
                tabIndex={open ? -1 : 0}
                aria-label={r("pulse.nn.expand")}
              >
                <span data-metric="nn-sum-ontime" hidden>
                  {now.onTimePct}
                </span>
                <SumRing pct={now.onTimePct} rated={rated} />
                <span className="r-nn-sumbody">
                  <span className="r-nn-sumlbl">{r("pulse.nn.onTimeNow")}</span>
                  <span className="r-nn-pills">
                    <span className="r-nn-pill">
                      <i style={{ background: LATE }} />
                      {r("pulse.nn.delayedN", { n: now.late })}
                    </span>
                    <span className="r-nn-pill">
                      <i style={{ background: EARLY }} />
                      {r("pulse.nn.earlyN", { n: now.early })}
                    </span>
                    {worst ? (
                      <span className="r-nn-pill" data-tone={cityTone(worst.onTimePct)}>
                        <i />
                        {r(CITY[worst.key])} {worst.onTimePct}%
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </div>
          </div>

          <div className="r-nn-fold" data-open={open ? "true" : "false"} aria-hidden={!open}>
            <div>
              <div className="r-nn-main">
                <div className="r-nn-ringwrap">
                  <Ring
                    onTime={rated ? now.onTimePct : 0}
                    late={rated ? now.latePct : 0}
                    early={rated ? now.earlyPct : 0}
                  />
                  <div className="r-nn-ringtxt">
                    <b>
                      {rated ? now.onTimePct : "-"}
                      {rated ? <small>%</small> : null}
                    </b>
                    <span>{r("pulse.nn.onTime")}</span>
                  </div>
                </div>
                <dl className="r-nn-stats">
                  <div>
                    <dt>
                      <i style={{ background: LATE }} aria-hidden="true" />
                      {r("pulse.nn.delayed")}
                    </dt>
                    <dd>{now.late}</dd>
                  </div>
                  <div>
                    <dt>
                      <i style={{ background: EARLY }} aria-hidden="true" />
                      {r("pulse.nn.early")}
                    </dt>
                    <dd>{now.early}</dd>
                  </div>
                  <div>
                    <dt>{r("pulse.nn.avgDelay")}</dt>
                    <dd>
                      {rated ? signedMin(now.avgDelaySec) : "-"}
                      <small> {r("pulse.nn.minShort")}</small>
                    </dd>
                  </div>
                </dl>
              </div>

              <Spark buckets={buckets} nowHour={nowHour} />

              <ul className="r-nn-cities">
                {now.cities.map((c) => (
                  <li key={c.key} className="r-nn-city" data-tone={cityTone(c.onTimePct)}>
                    <span className="r-nn-cityname">
                      <i aria-hidden="true" />
                      {r(CITY[c.key])}
                    </span>
                    <span className="r-nn-cityval">
                      <b>{c.onTimePct === null ? "-" : `${c.onTimePct}%`}</b>
                      <em>{r("pulse.nn.busesN", { n: c.live })}</em>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="r-nn-def">{r("pulse.nn.def")}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
