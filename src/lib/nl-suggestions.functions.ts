// Smart, dynamic suggestions for the "Ask in plain words" planner.
//
// Replaces hardcoded example chips with personalised natural-language prompts.
// Inputs we use:
//   - caller's current {lat,lng} (when granted)
//   - local clock + day-of-week
//   - this device's recent trip_history (most-frequent + time-of-day patterns)
//   - cross-device trending destinations for the same hour bucket
//   - a small Cyprus POI catalog as cold-start fallback
//
// Returns 3 freshly-generated trip-intent strings the user can tap to submit
// straight into the same heuristic+AI parser pipeline that handles typed input.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyDeviceToken } from "./device-auth.server";

const InputSchema = z.object({
  deviceId: z.string().min(8).max(128),
  deviceToken: z.string().min(20).max(128),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  /** Caller's local hour 0–23 (UTC if not provided). */
  hour: z.number().int().min(0).max(23).optional(),
  /** Caller's local day-of-week 0–6, 0=Sun. */
  dow: z.number().int().min(0).max(6).optional(),
});

export type NlSuggestion = {
  text: string;
  reason: "personal" | "trending" | "time-of-day" | "fallback";
};

// --- Cyprus POI fallbacks (used only when history is empty) ----------------
// Each entry has a window when it makes sense to surface.
type Poi = {
  label: string;
  lat: number;
  lng: number;
  hours: number[]; // hours where this POI is a reasonable destination
  weekend?: boolean;
};

const POIS: Poi[] = [
  { label: "Larnaca airport", lat: 34.875, lng: 33.624, hours: [4, 5, 6, 7, 8, 9, 15, 16, 17, 18, 19, 20, 21] },
  { label: "Paphos airport", lat: 34.718, lng: 32.485, hours: [5, 6, 7, 8, 9, 15, 16, 17, 18, 19, 20] },
  { label: "the University of Cyprus", lat: 35.144, lng: 33.411, hours: [7, 8, 9, 10, 13, 14, 15, 16, 17] },
  { label: "Eleftheria Square", lat: 35.172, lng: 33.362, hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] },
  { label: "Mall of Cyprus", lat: 35.131, lng: 33.301, hours: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21] },
  { label: "Finikoudes beach", lat: 34.917, lng: 33.640, hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], weekend: true },
  { label: "Ledra Street", lat: 35.173, lng: 33.359, hours: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] },
];

function pickPoiFallback(hour: number, dow: number, excludeLabels: Set<string>): Poi | null {
  const isWeekend = dow === 0 || dow === 6;
  const pool = POIS.filter(
    (p) =>
      !excludeLabels.has(p.label.toLowerCase()) &&
      p.hours.includes(hour) &&
      (!p.weekend || isWeekend),
  );
  if (pool.length === 0) return POIS[0];
  // Deterministic pick: rotate by hour so suggestions vary across the day.
  return pool[hour % pool.length];
}

// ── Phrasing helpers ──────────────────────────────────────────────────────
function phraseNow(label: string): string {
  return `to ${label} in 20 min`;
}
function phraseSoon(label: string, minutes: number): string {
  return `to ${label} in ${minutes} min`;
}
function phraseTomorrowMorning(label: string, hh: number): string {
  const h12 = hh > 12 ? hh - 12 : hh;
  const ampm = hh >= 12 ? "pm" : "am";
  return `to ${label} tomorrow ${h12}${ampm}`;
}
function phraseAt(label: string, hh: number, mm: number): string {
  const h12 = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
  const ampm = hh >= 12 ? "pm" : "am";
  const time = mm === 0 ? `${h12}${ampm}` : `${h12}:${String(mm).padStart(2, "0")}${ampm}`;
  return `leave at ${time} to ${label}`;
}

// Bucket coords ~110m so the same destination clusters
function bucket(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Bucket the caller into a city quadrant (~5km) so "trending nearby" stays local
function quadKey(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null) return null;
  return `${Math.round(lat * 20)}:${Math.round(lng * 20)}`;
}

export const getNlSuggestions = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<{ suggestions: NlSuggestion[] }> => {
    const ok = await verifyDeviceToken(data.deviceId, data.deviceToken).catch(() => false);
    // We still serve fallbacks even without a valid token, but skip personal data.
    const hour = data.hour ?? new Date().getUTCHours();
    const dow = data.dow ?? new Date().getUTCDay();

    const out: NlSuggestion[] = [];
    const usedLabels = new Set<string>();

    // ── 1. Personal repeat (same device, ±2h hour match) ──────────────────
    if (ok) {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: rows } = await supabaseAdmin
        .from("trip_history")
        .select("to_lat,to_lng,to_label,hour,dow,recorded_at")
        .eq("device_id", data.deviceId)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(120);

      if (rows && rows.length > 0) {
        type G = { label: string; lat: number; lng: number; count: number; hours: number[]; lastUsed: number };
        const groups = new Map<string, G>();
        for (const r of rows) {
          const key = `${bucket(r.to_lat)},${bucket(r.to_lng)}`;
          const ts = new Date(r.recorded_at).getTime();
          const g = groups.get(key);
          if (g) {
            g.count++;
            g.hours.push(r.hour);
            g.lastUsed = Math.max(g.lastUsed, ts);
          } else {
            groups.set(key, { label: r.to_label, lat: r.to_lat, lng: r.to_lng, count: 1, hours: [r.hour], lastUsed: ts });
          }
        }
        const ranked = [...groups.values()].sort((a, b) => b.count - a.count);

        // Same-hour match → "to X in ~N min" using their typical leave-time pattern
        const sameHour = ranked.find((g) => g.hours.some((h) => Math.abs(h - hour) <= 2 || Math.abs(h - hour) >= 22));
        if (sameHour) {
          out.push({ text: phraseSoon(sameHour.label, 20), reason: "personal" });
          usedLabels.add(sameHour.label.toLowerCase());
        }

        // Top destination at a tomorrow-morning anchor
        const top = ranked.find((g) => !usedLabels.has(g.label.toLowerCase()));
        if (top && out.length < 3) {
          // Use the most common hour for that destination
          const hh = mostCommon(top.hours);
          if (hh >= 5 && hh <= 22) {
            out.push({ text: phraseTomorrowMorning(top.label, hh), reason: "personal" });
            usedLabels.add(top.label.toLowerCase());
          }
        }
      }
    }

    // ── 2. Trending nearby (cross-device, same quadrant + hour bucket) ────
    if (out.length < 3) {
      const quad = quadKey(data.lat, data.lng);
      try {
        const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
        const { data: rows } = await supabaseAdmin
          .from("trip_history")
          .select("to_lat,to_lng,to_label,from_lat,from_lng,hour")
          .gte("recorded_at", since)
          .gte("hour", Math.max(0, hour - 1))
          .lte("hour", Math.min(23, hour + 1))
          .limit(500);

        if (rows && rows.length > 0) {
          type T = { label: string; count: number };
          const tally = new Map<string, T>();
          for (const r of rows) {
            // If we know the caller's quadrant, only count rows departing from it
            if (quad) {
              const fromQuad = `${Math.round(r.from_lat * 20)}:${Math.round(r.from_lng * 20)}`;
              if (fromQuad !== quad) continue;
            }
            const key = `${bucket(r.to_lat)},${bucket(r.to_lng)}`;
            const t = tally.get(key);
            if (t) t.count++;
            else tally.set(key, { label: r.to_label, count: 1 });
          }
          const trending = [...tally.values()]
            .filter((t) => !usedLabels.has(t.label.toLowerCase()) && t.count >= 2)
            .sort((a, b) => b.count - a.count)[0];
          if (trending) {
            out.push({ text: phraseNow(trending.label), reason: "trending" });
            usedLabels.add(trending.label.toLowerCase());
          }
        }
      } catch (err) {
        console.warn("[nl-suggestions] trending query failed:", (err as Error).message);
      }
    }

    // ── 3. Time-of-day fallbacks from POI catalog ─────────────────────────
    while (out.length < 3) {
      const poi = pickPoiFallback(hour, dow, usedLabels);
      if (!poi) break;
      usedLabels.add(poi.label.toLowerCase());

      // Vary phrasing by slot index so all 3 chips don't read identically
      const slot = out.length;
      let text: string;
      if (slot === 0 && hour >= 5 && hour <= 9) {
        // morning slot — anchor at typical leave time
        text = phraseAt(poi.label, Math.max(hour, 8), 30);
      } else if (slot === 2) {
        text = phraseTomorrowMorning(poi.label, 7);
      } else {
        text = phraseNow(poi.label);
      }
      out.push({ text, reason: "fallback" });
    }

    return { suggestions: out.slice(0, 3) };
  });

function mostCommon(arr: number[]): number {
  const c = new Map<number, number>();
  for (const v of arr) c.set(v, (c.get(v) ?? 0) + 1);
  let best = arr[0];
  let bestN = 0;
  for (const [v, n] of c) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}
