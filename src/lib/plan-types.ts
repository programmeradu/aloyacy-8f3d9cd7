/**
 * Shared shape for a planning endpoint (origin or destination).
 * Lives on its own so route, components and pure helpers can all import it
 * without pulling the whole planning screen into their module graph.
 */
export type Point = { lat: number; lng: number; label: string };

export type TimeIntent = {
  leaveByISO: string | null;
  arriveByISO: string | null;
};
