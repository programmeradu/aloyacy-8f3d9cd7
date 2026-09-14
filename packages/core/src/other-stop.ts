// RAPTOR other-stop ask for the live-replan sheet.
// "Bus 25 leaves in 3 min from Makariou." Same stop stays quiet.
// Do not invent a taxi euro.

export const OTHER_STOP_WALK_M = 80;

export type OtherStopAsk = {
  routeShort: string;
  stopName: string;
  leaveMin: number;
};

type Legish = {
  kind: string;
  distanceMeters?: number;
  routeShort?: string;
  board?: { stopId: string; name: string; departureUnix: number };
};

export function otherStopAsk(input: {
  legs: readonly Legish[];
  hereStopId?: string | null;
  nowUnix: number;
}): OtherStopAsk | null {
  const idx = input.legs.findIndex((l) => l.kind === "ride");
  if (idx < 0) return null;
  const ride = input.legs[idx];
  const board = ride.board;
  if (!ride.routeShort?.trim() || !board?.name?.trim() || !board.stopId) return null;
  if (input.hereStopId && board.stopId === input.hereStopId) return null;
  let accessM = 0;
  for (let i = 0; i < idx; i++) {
    const l = input.legs[i];
    if (l.kind === "walk") accessM += l.distanceMeters ?? 0;
  }
  if (!input.hereStopId && accessM < OTHER_STOP_WALK_M) return null;
  const leaveMin = Math.max(0, Math.round((board.departureUnix - input.nowUnix) / 60));
  return { routeShort: ride.routeShort, stopName: board.name, leaveMin };
}

export function otherStopLine(ask: OtherStopAsk): string {
  if (ask.leaveMin <= 0) return `Bus ${ask.routeShort} leaves now from ${ask.stopName}.`;
  return `Bus ${ask.routeShort} leaves in ${ask.leaveMin} min from ${ask.stopName}.`;
}
