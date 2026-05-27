// Personal commute learner.
//
// When a rider completes a multi-leg trip we record the (from, to,
// day-of-week, time-bucket) signature so the home page can later
// surface a one-tap "Your usual 8 AM to work" card.
//
// We don't need H3 here — a coarse grid (~150 m at Cyprus latitudes)
// is plenty for "is this the same commute". This keeps the function
// dependency-free.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ~150m grid: 0.0015° ≈ 167m lat. Cheap, deterministic.
function gridKey(lat: number, lng: number): string {
  const q = (n: number) => Math.round(n * 666) / 666; // 1/0.0015
  return `${q(lat).toFixed(4)},${q(lng).toFixed(4)}`;
}
function timeBucket(d: Date): number {
  // 30-minute buckets local time (0..47)
  return d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
}

const recordSchema = z.object({
  fromLat: z.number(),
  fromLng: z.number(),
  toLat: z.number(),
  toLng: z.number(),
  fromLabel: z.string().max(160).optional(),
  toLabel: z.string().max(160).optional(),
  startedAtUnix: z.number().int().positive(),
});

export const recordCommutePattern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => recordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fromH3 = gridKey(data.fromLat, data.fromLng);
    const toH3 = gridKey(data.toLat, data.toLng);
    const started = new Date(data.startedAtUnix * 1000);
    const bucket = timeBucket(started);
    const dow = started.getDay();
    const dowBit = 1 << dow;

    const { data: existing } = await supabase
      .from("commute_patterns")
      .select("id, count, dow_mask")
      .eq("user_id", userId)
      .eq("from_h3", fromH3)
      .eq("to_h3", toH3)
      .eq("time_bucket", bucket)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("commute_patterns")
        .update({
          count: existing.count + 1,
          dow_mask: existing.dow_mask | dowBit,
          last_seen: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("commute_patterns").insert({
        user_id: userId,
        from_h3: fromH3,
        to_h3: toH3,
        time_bucket: bucket,
        dow_mask: dowBit,
        count: 1,
        from_label: data.fromLabel ?? null,
        to_label: data.toLabel ?? null,
        from_lat: data.fromLat,
        from_lng: data.fromLng,
        to_lat: data.toLat,
        to_lng: data.toLng,
      });
    }
    return { ok: true };
  });

export const getTopCommuteSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const now = new Date();
    const dow = now.getDay();
    const dowBit = 1 << dow;
    const bucketNow = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);

    const { data: rows } = await supabase
      .from("commute_patterns")
      .select(
        "from_label, to_label, from_lat, from_lng, to_lat, to_lng, time_bucket, dow_mask, count",
      )
      .eq("user_id", userId)
      .gte("count", 2)
      .order("count", { ascending: false })
      .limit(20);
    if (!rows || rows.length === 0) return { suggestion: null };

    // Score: bigger count + closer-in-time + DoW match
    const scored = rows
      .map((r) => {
        const dowMatch = (r.dow_mask & dowBit) !== 0 ? 1 : 0;
        const diff = Math.min(
          Math.abs(r.time_bucket - bucketNow),
          48 - Math.abs(r.time_bucket - bucketNow),
        );
        const timeScore = Math.max(0, 1 - diff / 6); // within 3h
        return {
          ...r,
          score: r.count + dowMatch * 1.5 + timeScore * 2,
          diffBuckets: diff,
        };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best.score < 2 || best.diffBuckets > 8) return { suggestion: null };

    const hh = Math.floor(best.time_bucket / 2);
    const mm = best.time_bucket % 2 === 0 ? "00" : "30";
    return {
      suggestion: {
        fromLabel: best.from_label ?? "Saved start",
        toLabel: best.to_label ?? "Saved destination",
        fromLat: best.from_lat,
        fromLng: best.from_lng,
        toLat: best.to_lat,
        toLng: best.to_lng,
        usualTime: `${String(hh).padStart(2, "0")}:${mm}`,
        count: best.count,
      },
    };
  });
