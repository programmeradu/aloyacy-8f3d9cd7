import { API_BASE } from "./api";
import type { NoShowSlot } from "@aloya/core/no-show";

export async function fetchNoShowSlots(routeIds: string[]): Promise<NoShowSlot[]> {
  if (routeIds.length === 0) return [];
  const res = await fetch(`${API_BASE}/api/public/stop-run-hints`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ routeIds: routeIds.slice(0, 30) }),
  });
  if (!res.ok) throw new Error(`No-show ${res.status}`);
  const body = (await res.json()) as { slots?: NoShowSlot[] };
  return body.slots ?? [];
}
