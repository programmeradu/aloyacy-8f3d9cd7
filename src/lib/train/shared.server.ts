// Shared maths and blended-statistic upsert used by the training roll-ups.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function blendStat<T extends Record<string, unknown>>(
  table: string,
  key: T,
  meanField: string,
  sample: { mean: number; count: number },
): Promise<void> {
  // Dynamic table names defeat the generated Database type; the writes go
  // through service-role and are validated by the column types at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  let q = db.from(table).select(`${meanField}, sample_count`);
  for (const [k, v] of Object.entries(key)) q = q.eq(k, v);
  const { data } = await q.maybeSingle();
  const prevMean = (data as Record<string, number> | null)?.[meanField] ?? 0;
  const prevN = (data as { sample_count?: number } | null)?.sample_count ?? 0;
  const newN = prevN + sample.count;
  if (newN === 0) return;
  const newMean = (prevMean * prevN + sample.mean * sample.count) / newN;
  await db.from(table).upsert(
    {
      ...key,
      [meanField]: newMean,
      sample_count: newN,
      updated_at: new Date().toISOString(),
    },
    { onConflict: Object.keys(key).join(",") },
  );
}
