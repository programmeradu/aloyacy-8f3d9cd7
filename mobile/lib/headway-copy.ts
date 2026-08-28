import { cyClock } from "@aloya/core/cy-time";
import type { HeadwayHint, HeadwayWhen } from "@aloya/core/headway-chance";
import { palette } from "@/constants/theme";

export const truthLine = {
  fontFamily: "Geist_500Medium",
  fontSize: 13,
  lineHeight: 18,
  color: palette.ink,
  marginTop: 8,
  textTransform: "none" as const,
  letterSpacing: 0,
};
export const softLine = {
  ...truthLine,
  fontSize: 12.5,
  lineHeight: 17,
  color: palette.inkSoft,
  marginTop: 4,
};

const WHEN: Record<HeadwayWhen, string> = {
  weekdayMorning: "on weekday mornings",
  weekdayAfternoon: "on weekday afternoons",
  weekdayEvening: "on weekday evenings",
  weekdayNight: "on weekday nights",
  weekendMorning: "on weekend mornings",
  weekendAfternoon: "on weekend afternoons",
  weekendEvening: "on weekend evenings",
  weekendNight: "on weekend nights",
};

export function headwayCopy(hint: HeadwayHint, routeShort: string): string {
  const when = WHEN[hint.when];
  const every =
    hint.source === "observed"
      ? `Bus ${routeShort} runs about every ${hint.meanMin} min here ${when}.`
      : `The timetable has a bus ${routeShort} about every ${hint.meanMin} min here ${when}.`;
  const last = hint.lastSeenMin != null ? `Last one seen ${hint.lastSeenMin} min ago.` : "";
  const chance =
    hint.chancePct != null
      ? `About ${hint.chancePct}% chance one arrives before ${cyClock(hint.beforeUnix * 1000)}.`
      : "";
  return [every, last, chance].filter(Boolean).join(" ");
}
