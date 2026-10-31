// Traffic: the main incident with a painted thumbnail chosen by its kind, then
// the next few as plain lines. A medium card, so it never sits as a second
// heavy picture card beside the news. Copy normalisation lives in
// @/lib/pulse-traffic-copy.

import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import {
  friendlyTrafficHeadline,
  friendlyTrafficLine,
  parseStructured,
  specificFromFeed,
  type TrafficKind,
} from "@/lib/pulse-traffic-copy";
import { tidy } from "./shared";
import pulseTrafficImg from "@/assets/pulse-traffic-card.jpg";
import pulseTrafficRoadworksImg from "@/assets/pulse-traffic-roadworks.jpg";
import pulseTrafficClosureImg from "@/assets/pulse-traffic-closure.jpg";
import pulseTrafficCongestionImg from "@/assets/pulse-traffic-congestion.jpg";

function pickTrafficImage(kind: TrafficKind): string {
  switch (kind) {
    case "roadworks":
      return pulseTrafficRoadworksImg;
    case "closure":
      return pulseTrafficClosureImg;
    case "congestion":
      return pulseTrafficCongestionImg;
    default:
      return pulseTrafficImg;
  }
}

export function TrafficCard({
  payload,
  city,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["traffic"]>;
  city: string;
  isEl: boolean;
}) {
  const top = payload.incidents[0];
  if (!top) return null;

  const severity = isEl
    ? payload.highest === "high"
      ? "Σοβαρό"
      : payload.highest === "medium"
        ? "Αξιοσημείωτο"
        : "Ήπιο"
    : payload.highest === "high"
      ? "Severe"
      : payload.highest === "medium"
        ? "Notable"
        : "Minor";
  const count =
    payload.count === 1
      ? isEl
        ? "1 ενεργό συμβάν"
        : "1 live incident"
      : isEl
        ? `${payload.count} ενεργά συμβάντα`
        : `${payload.count} live incidents`;

  const topStructured = parseStructured(top.headline, isEl);
  const heroHeadline = tidy(
    topStructured?.headline ??
      specificFromFeed(top.headline, isEl) ??
      friendlyTrafficHeadline(top.kind, top.road, top.zone, city, isEl),
  );
  const heroImg = pickTrafficImage(topStructured?.kind ?? top.kind);
  const rest = payload.incidents.slice(1, 4);
  const more = payload.count - rest.length - 1;

  return (
    <article className="r-pc r-traffic" data-card="traffic">
      <div className="r-pc-body">
        <div className="r-tr-head">
          <span className="r-tr-thumb">
            <img src={heroImg} alt="" aria-hidden="true" loading="lazy" decoding="async" />
          </span>
          <span className="r-tr-txt">
            <span className="r-pc-kick">{isEl ? `Κυκλοφορία, ${city}` : `Traffic in ${city}`}</span>
            <span className="r-tr-title">{heroHeadline}</span>
            <span className="r-tr-meta">
              <span className="r-pc-tag" data-tone={payload.highest === "high" ? undefined : "ink"}>
                {severity}
              </span>
              <span>{count}</span>
            </span>
          </span>
        </div>
        {rest.length > 0 && (
          <ul className="r-pc-rows r-tr-rows">
            {rest.map((inc) => (
              <li key={inc.id} className="r-pc-row">
                <span className="r-tr-line">
                  {tidy(
                    parseStructured(inc.headline, isEl)?.line ??
                      specificFromFeed(inc.headline, isEl) ??
                      friendlyTrafficLine(inc.kind, inc.road, inc.zone, city, isEl),
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {more > 0 && (
          <p className="r-pc-text">{isEl ? `Ακόμη ${more} στους δρόμους` : `${more} more on the roads`}</p>
        )}
      </div>
    </article>
  );
}
