// Today's editorial briefing — composes weather, fixtures, events, holidays,
// name days, and a rotating fun fact into a single "Cyprus today" payload.
// Public, read-only. Copy composition is pure (@aloya/core/today-brief);
// live signal fetching lives in today.server.ts.

import { createServerFn } from "@tanstack/react-start";
import type { TodayInput, TodayBriefing } from "@aloya/core/today-brief";

export type {
  TodayBriefing,
  TodayInput,
  TodayTheme,
  TodayTile,
  TodayTileKind,
} from "@aloya/core/today-brief";

export const getTodayBriefing = createServerFn({ method: "GET" })
  .inputValidator((data: TodayInput | undefined): TodayInput => {
    const v = data ?? {};
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
    return {
      lat: num(v.lat),
      lng: num(v.lng),
      destLat: num(v.destLat),
      destLng: num(v.destLng),
      destCity:
        typeof v.destCity === "string" && v.destCity.length > 0 && v.destCity.length < 64
          ? v.destCity
          : undefined,
    };
  })
  .handler(async ({ data }): Promise<TodayBriefing> => {
    const { buildTodayBriefing } = await import("./today.server");
    return buildTodayBriefing(data);
  });
