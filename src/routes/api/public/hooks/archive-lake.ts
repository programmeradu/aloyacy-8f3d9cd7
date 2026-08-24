import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function guard(request: Request) {
  const expected =
    import.meta.env.VITE_CUSTOM_SUPABASE_ANON_KEY || process.env.CUSTOM_SUPABASE_ANON_KEY;
  const provided = request.headers.get("apikey");
  if (expected && provided !== expected) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return null;
}

export async function archiveTable(tableName: string, daysOld: number, bucket: any) {
  if (!bucket) {
    console.warn(`[archive] Skipping ${tableName} - DATA_LAKE bucket not found in environment.`);
    return 0;
  }
  
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - daysOld);
  const cutoff = dateThreshold.toISOString();

  let totalArchived = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select("*")
      .lt("created_at", cutoff)
      .limit(5000);

    if (error) {
      console.error(`[archive] Error fetching ${tableName}:`, error);
      break;
    }
    
    if (!data || data.length === 0) {
      break;
    }

    const jsonl = data.map((row: any) => JSON.stringify(row)).join("\n");
    const timestamp = new Date().getTime();
    const objectKey = `${tableName}/${dateThreshold.toISOString().split("T")[0]}/${timestamp}.jsonl`;

    await bucket.put(objectKey, jsonl);
    
    const ids = data.map((row: any) => row.id).filter(Boolean);
    if (ids.length > 0) {
      await supabaseAdmin.from(tableName).delete().in("id", ids);
    } else {
      await supabaseAdmin.from(tableName).delete().lt("created_at", cutoff);
      break;
    }

    totalArchived += data.length;
    
    if (data.length < 5000) {
      break;
    }
  }

  return totalArchived;
}

async function runFromRequest(request: Request) {
  const denied = guard(request);
  if (denied) return denied;

  const R2 = (process.env as any).DATA_LAKE;
  if (!R2) {
    return json({ ok: false, error: "DATA_LAKE R2 binding not found" }, 500);
  }

  try {
    const snapshots = await archiveTable("rt_snapshots", 7, R2);
    const pulses = await archiveTable("pulse_signals", 7, R2);
    const arrivals = await archiveTable("observed_arrivals", 7, R2);

    return json({
      ok: true,
      message: "Data Lake archival completed",
      archived: {
        rt_snapshots: snapshots,
        pulse_signals: pulses,
        observed_arrivals: arrivals
      }
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Archival failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/hooks/archive-lake")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => await runFromRequest(request),
      POST: async ({ request }) => await runFromRequest(request),
    },
  },
});

