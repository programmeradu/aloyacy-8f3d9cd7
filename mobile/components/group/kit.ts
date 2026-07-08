// Shared plumbing for the native group-watch screen: row shapes, tuning
// constants, storage keys and the single fetch entry point for group
// actions. Pure copy helpers live in @aloya/core/group-format so web and
// native word member state identically.

import { API_BASE } from "@/lib/api";
import { palette } from "@/constants/theme";
import type { GroupMapMember } from "@/components/GroupMap";
import { GROUP_STALE_MS } from "@aloya/core/group-format";

export { initials, formatEta, timeAgo, isStale } from "@aloya/core/group-format";

export const HERO =
  "https://app.aloya.cy/__l5e/assets-v1/5c4831ab-cd68-46d1-ae67-05259fc19a64/group-converge-hero.jpg";
export const PING_INTERVAL_MS = 25_000;
export const STALE_MS = GROUP_STALE_MS;
export const TOKEN_KEY = (code: string) => `aloya.group.${code}.token`;
export const NAME_KEY = "aloya.group.lastName";

export const MEMBER_TONES = [
  palette.aegeanDeep,
  palette.ochre,
  palette.olive,
  palette.ink,
] as const;

export type GroupRow = {
  id: string;
  code: string;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  created_by_name: string | null;
  created_at: string;
  expires_at: string;
};

export type MemberRow = {
  id: string;
  group_id: string;
  display_name: string;
  origin_label: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_updated: string | null;
  eta_minutes: number | null;
  status: string;
  is_creator: boolean;
  joined_at: string;
};

export type GroupAction = "join" | "ping" | "leave" | "end";

export async function callGroups<T>(
  action: GroupAction,
  payload: unknown,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/api/public/trip-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Active members reshaped for the live map overlay. */
export function toMapMembers(members: MemberRow[], meId: string | null): GroupMapMember[] {
  return members
    .filter((m) => m.status === "active")
    .map((m) => ({
      id: m.id,
      displayName: m.display_name,
      lat: m.last_lat,
      lng: m.last_lng,
      lastUpdated: m.last_updated,
      isMe: m.id === meId,
      isCreator: m.is_creator,
    }));
}
