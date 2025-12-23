import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureDeviceToken, verifyDeviceToken } from "./device-auth.server";

// Anonymous device IDs are not secrets — anyone who learns one could read
// or write that device's trip history. Every read/write requires the
// device-bound bearer token issued by `claimDeviceToken` on first use.
const DeviceAuth = z.object({
  deviceId: z.string().min(8).max(128),
  deviceToken: z.string().min(20).max(128),
});

export const claimDeviceToken = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ deviceId: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const result = await ensureDeviceToken(data.deviceId);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, token: result.token };
  });

// ---------- record ----------
const RecordSchema = DeviceAuth.extend({
  from: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    label: z.string().min(1).max(200),
  }),
  to: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    label: z.string().min(1).max(200),
  }),
  routeShort: z.string().max(16).optional().nullable(),
  source: z.enum(["completed", "planned"]).default("completed"),
});

export const recordTripHistory = createServerFn({ method: "POST" })
  .inputValidator((input) => RecordSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await verifyDeviceToken(data.deviceId, data.deviceToken))) {
      return { ok: false as const, error: "unauthorized" };
    }
    const now = new Date();
    const { error } = await supabaseAdmin.from("trip_history").insert({
      device_id: data.deviceId,
      from_lat: data.from.lat,
      from_lng: data.from.lng,
      from_label: data.from.label,
      to_lat: data.to.lat,
      to_lng: data.to.lng,
      to_label: data.to.label,
      route_short: data.routeShort ?? null,
      source: data.source,
      dow: now.getUTCDay(),
      hour: now.getUTCHours(),
    });
    if (error) {
      console.error("recordTripHistory failed", error);
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });

// ---------- read ----------
export type TripSuggestion = {
  key: string;
  toLat: number;
  toLng: number;
  toLabel: string;
  fromLat: number;
  fromLng: number;
  fromLabel: string;
  count: number;
  lastUsed: number;
  blurb: string;
  score: number;
};

const QuerySchema = z.object({
  deviceId: z.string().min(8).max(128),
});

// Bucket coordinates to ~110m so "the same destination" clusters together.
function bucket(n: number) {
  return Math.round(n * 1000) / 1000;
}

export const getTripSuggestions = createServerFn({ method: "POST" })
  .inputValidator((input) => QuerySchema.parse(input))
  .handler(async ({ data }): Promise<{ suggestions: TripSuggestion[] }> => {
    // Pull last 90 days of history for this device.
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("trip_history")
      .select(
        "from_lat,from_lng,from_label,to_lat,to_lng,to_label,recorded_at,dow,hour",
      )
      .eq("device_id", data.deviceId)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("getTripSuggestions failed", error);
      return { suggestions: [] };
    }
    if (!rows || rows.length === 0) return { suggestions: [] };

    // Group by destination bucket. Score: count, recency decay (14d half-life),
    // and a bonus when the trip's hour is within ±2 of the current hour.
    const now = new Date();
    const nowHour = now.getUTCHours();
    const nowDow = now.getUTCDay();
    type Group = {
      key: string;
      toLat: number;
      toLng: number;
      toLabel: string;
      fromLat: number;
      fromLng: number;
      fromLabel: string;
      count: number;
      lastUsed: number;
      hourBonus: number;
      dowBonus: number;
    };
    const groups = new Map<string, Group>();
    for (const r of rows) {
      const key = `${bucket(r.to_lat)},${bucket(r.to_lng)}`;
      const ts = new Date(r.recorded_at).getTime();
      const hourDelta = Math.min(
        Math.abs(r.hour - nowHour),
        24 - Math.abs(r.hour - nowHour),
      );
      const hourMatch = hourDelta <= 2 ? 1 : 0;
      const dowMatch = r.dow === nowDow ? 1 : 0;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.lastUsed = Math.max(existing.lastUsed, ts);
        existing.hourBonus += hourMatch;
        existing.dowBonus += dowMatch;
      } else {
        groups.set(key, {
          key,
          toLat: r.to_lat,
          toLng: r.to_lng,
          toLabel: r.to_label,
          fromLat: r.from_lat,
          fromLng: r.from_lng,
          fromLabel: r.from_label,
          count: 1,
          lastUsed: ts,
          hourBonus: hourMatch,
          dowBonus: dowMatch,
        });
      }
    }

    const suggestions: TripSuggestion[] = [];
    for (const g of groups.values()) {
      const daysAgo = (Date.now() - g.lastUsed) / 86_400_000;
      const recency = Math.exp(-daysAgo / 14);
      const score =
        g.count * recency + g.hourBonus * 1.5 + g.dowBonus * 0.5;

      let blurb = "Recent destination";
      if (g.hourBonus >= 2 && g.count >= 2) blurb = "Usually around now";
      else if (g.dowBonus >= 2 && g.count >= 2) blurb = "Often on this day";
      else if (g.count >= 3) blurb = `${g.count} trips here`;
      else if (daysAgo < 2) blurb = "Recently visited";

      suggestions.push({
        key: g.key,
        toLat: g.toLat,
        toLng: g.toLng,
        toLabel: g.toLabel,
        fromLat: g.fromLat,
        fromLng: g.fromLng,
        fromLabel: g.fromLabel,
        count: g.count,
        lastUsed: g.lastUsed,
        blurb,
        score,
      });
    }

    suggestions.sort((a, b) => b.score - a.score);
    return { suggestions: suggestions.slice(0, 4) };
  });
