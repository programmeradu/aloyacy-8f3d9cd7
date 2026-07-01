// Group trips — multi-rider "watch" surface. One creator starts a group
// tied to a destination, everyone else joins from the shared link and
// the whole group sees each other converging on the map. Members ping
// their position + ETA every 20s while the group is active.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { ActiveTrip } from "./trip-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PING_INTERVAL_MS = 20_000;
const PUBLIC_BASE = "https://app.aloya.cy";
const STORAGE_KEY = "aloya.groupTrip.v1";

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no confusables
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
function randomToken(): string {
  const a = Math.floor(Math.random() * 0xffffffff).toString(36);
  const b = Math.floor(Math.random() * 0xffffffff).toString(36);
  const c = Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${a}${b}${c}${Date.now().toString(36)}`;
}

export type GroupTripSession = {
  groupId: string;
  code: string;
  memberToken: string;
  displayName: string;
  url: string;
  destinationLabel: string;
};

const cache = new Map<string, GroupTripSession>();

async function loadCached(): Promise<GroupTripSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GroupTripSession;
  } catch {
    return null;
  }
}
async function saveCached(s: GroupTripSession | null) {
  try {
    if (!s) await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // best effort
  }
}

export function useGroupTrip(opts: {
  active: ActiveTrip;
  fix: { lat: number; lng: number } | null;
  etaMinutes: number | null;
  displayName?: string;
}) {
  const { active, fix, etaMinutes, displayName } = opts;
  const key = `${active.startedAt}:${active.to.label}`;
  const [session, setSession] = useState<GroupTripSession | null>(() => cache.get(key) ?? null);
  const [busy, setBusy] = useState(false);
  const lastPingRef = useRef(0);

  useEffect(() => {
    if (session) return;
    let cancelled = false;
    void loadCached().then((s) => {
      if (cancelled) return;
      if (s && s.destinationLabel === active.to.label) {
        cache.set(key, s);
        setSession(s);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, active.to.label, session]);

  const create = useCallback(async (): Promise<GroupTripSession | null> => {
    if (busy) return null;
    setBusy(true);
    try {
      const code = randomCode();
      const memberToken = randomToken();
      const { data: { user } } = await supabase.auth.getUser();
      const name = displayName?.trim() || user?.user_metadata?.full_name || "You";

      const { data: groupRow, error: gErr } = await supabase
        .from("trip_groups")
        .insert({
          code,
          destination_label: active.to.label,
          destination_lat: active.to.lat,
          destination_lng: active.to.lng,
          created_by_name: name,
          created_by_id: user?.id ?? null,
        })
        .select("id")
        .single();
      if (gErr || !groupRow) {
        console.warn("[groupTrip] create failed", gErr);
        return null;
      }

      const { error: mErr } = await supabase.from("trip_group_members").insert({
        group_id: groupRow.id,
        member_token: memberToken,
        display_name: name,
        origin_label: active.from.label,
        last_lat: fix?.lat ?? null,
        last_lng: fix?.lng ?? null,
        last_updated: fix ? new Date().toISOString() : null,
        eta_minutes: etaMinutes,
        is_creator: true,
        owner_id: user?.id ?? null,
        status: "active",
      });
      if (mErr) {
        console.warn("[groupTrip] join-as-creator failed", mErr);
        return null;
      }

      const next: GroupTripSession = {
        groupId: groupRow.id,
        code,
        memberToken,
        displayName: name,
        url: `${PUBLIC_BASE}/group/${code}`,
        destinationLabel: active.to.label,
      };
      cache.set(key, next);
      await saveCached(next);
      setSession(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, [busy, active, fix, etaMinutes, displayName, key]);

  const leave = useCallback(async () => {
    if (!session) return;
    await supabase
      .from("trip_group_members")
      .update({ status: "left", last_updated: new Date().toISOString() })
      .eq("member_token", session.memberToken);
    cache.delete(key);
    await saveCached(null);
    setSession(null);
  }, [session, key]);

  // Ping own row while the group is active.
  useEffect(() => {
    if (!session || !fix) return;
    const now = Date.now();
    if (now - lastPingRef.current < PING_INTERVAL_MS) return;
    lastPingRef.current = now;
    void supabase
      .from("trip_group_members")
      .update({
        last_lat: fix.lat,
        last_lng: fix.lng,
        last_updated: new Date().toISOString(),
        eta_minutes: etaMinutes,
      })
      .eq("member_token", session.memberToken);
  }, [session, fix, etaMinutes]);

  return { session, create, leave, busy };
}
