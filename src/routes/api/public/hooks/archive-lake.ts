import { createFileRoute } from "@tanstack/react-router";
import { createLogger } from "@/lib/logger";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const log = createLogger("archive-lake");

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

export async function archiveTable(tableName: string, daysOld: number, bucket: any, s3?: S3Client) {
  if (!bucket && !s3) {
    log.warn(`Skipping ${tableName} - DATA_LAKE bucket not found in environment.`);
    return 0;
  }
  
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - daysOld);
  const cutoff = dateThreshold.toISOString();

  // Table names are chosen at call time, so the generated Database union
  // cannot narrow them — talk to PostgREST through an untyped handle.
  const db = supabaseAdmin as unknown as {
    from: (table: string) => any;
  };

  let totalArchived = 0;
  while (true) {
    const { data, error } = await db
      .from(tableName)
      .select("*")
      .lt("created_at", cutoff)
      .limit(5000);

    if (error) {
      log.error(`Error fetching ${tableName}: ${error.message}`);
      break;
    }
    
    if (!data || data.length === 0) {
      break;
    }

    const jsonl = data.map((row: any) => JSON.stringify(row)).join("\n");
    const timestamp = new Date().getTime();
    const objectKey = `${tableName}/${dateThreshold.toISOString().split("T")[0]}/${timestamp}.jsonl`;

    if (s3) {
      await s3.send(new PutObjectCommand({
        Bucket: "aloya-data-lake",
        Key: objectKey,
        Body: jsonl,
        ContentType: "application/jsonl"
      }));
    } else {
      await bucket.put(objectKey, jsonl);
    }
    
    const ids = data.map((row: any) => row.id).filter(Boolean);
    if (ids.length > 0) {
      await db.from(tableName).delete().in("id", ids);
    } else {
      await db.from(tableName).delete().lt("created_at", cutoff);
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

  let R2 = (process.env as any).DATA_LAKE;
  let s3: S3Client | undefined;

  // If R2 binding is missing (e.g. Lovable deployment), fallback to standard S3 API using AWS credentials
  if (!R2) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    
    if (accountId && accessKeyId && secretAccessKey) {
      s3 = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
  }

  if (!R2 && !s3) {
    return json({ ok: false, error: "Neither DATA_LAKE R2 binding nor S3 credentials found" }, 500);
  }

  try {
    const snapshots = await archiveTable("rt_snapshots", 7, R2, s3);
    const pulses = await archiveTable("pulse_signals", 7, R2, s3);
    const arrivals = await archiveTable("observed_arrivals", 7, R2, s3);

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

