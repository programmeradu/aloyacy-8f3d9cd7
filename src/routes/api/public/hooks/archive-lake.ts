import { createFileRoute } from "@tanstack/react-router";
import { createLogger } from "@/lib/logger";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getClient } from "@/lib/lake.server";
import { isCronAuthorized } from "@/lib/cron-auth.server";

const log = createLogger("archive-lake");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PAGE = 5000;
const DELETE_ID_CHUNK = 200;
const DELETE_COMPOSITE_CHUNK = 40;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function guard(request: Request) {
  // Bearer CRON_SECRET only; refuses everything when the secret is unset.
  if (!isCronAuthorized(request)) return json({ ok: false, error: "Unauthorized" }, 401);
  return null;
}

type Db = { from: (table: string) => any };

async function deleteArchived(db: Db, tableName: string, data: Array<Record<string, unknown>>) {
  if (data.length === 0) return true;
  const ids = data.map((row) => row.id).filter((id) => id != null && id !== "");
  if (ids.length === data.length) {
    for (let i = 0; i < ids.length; i += DELETE_ID_CHUNK) {
      const chunk = ids.slice(i, i + DELETE_ID_CHUNK);
      const { error } = await db.from(tableName).delete().in("id", chunk);
      if (error) {
        log.error(`Error deleting ${tableName} by id: ${error.message}`);
        return false;
      }
    }
    return true;
  }
  for (let i = 0; i < data.length; i += DELETE_COMPOSITE_CHUNK) {
    const chunk = data.slice(i, i + DELETE_COMPOSITE_CHUNK);
    for (const row of chunk) {
      const { error } = await db
        .from(tableName)
        .delete()
        .eq("trip_id", row.trip_id)
        .eq("stop_id", row.stop_id);
      if (error) {
        log.error(`Error deleting ${tableName} ${row.trip_id}/${row.stop_id}: ${error.message}`);
        return false;
      }
    }
  }
  return true;
}

/**
 * Archive window, in minutes. This MUST be shorter than the table's Postgres
 * retention TTL, otherwise the rows are purged before the archiver ever sees
 * them and the data lake stays empty. Current TTLs (20260821 migration):
 * rt_snapshots = 30 minutes, observed_arrivals = 2 days.
 */
export async function archiveTable(
  tableName: string,
  timeColumn = "created_at",
  minutesOld = 10,
  bucket: any = null,
  s3?: S3Client,
) {
  if (!bucket && !s3) {
    log.warn(`Skipping ${tableName} - DATA_LAKE bucket not found in environment.`);
    return 0;
  }

  const dateThreshold = new Date(Date.now() - minutesOld * 60_000);
  const cutoff = dateThreshold.toISOString();

  // Table names are chosen at call time, so the generated Database union
  // cannot narrow them — talk to PostgREST through an untyped handle.
  const db = supabaseAdmin as unknown as Db;

  let totalArchived = 0;
  while (true) {
    const { data, error } = await db
      .from(tableName)
      .select("*")
      .lt(timeColumn, cutoff)
      .order(timeColumn, { ascending: true })
      .order("trip_id", { ascending: true })
      .order("stop_id", { ascending: true })
      .limit(PAGE);

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
      await s3.send(
        new PutObjectCommand({
          Bucket: "aloya-data-lake",
          Key: objectKey,
          Body: jsonl,
          ContentType: "application/jsonl",
        }),
      );
    } else {
      await bucket.put(objectKey, jsonl);
    }

    const deleted = await deleteArchived(db, tableName, data);
    if (!deleted) break;

    totalArchived += data.length;

    if (data.length < PAGE) {
      break;
    }
  }

  return totalArchived;
}

async function runFromRequest(request: Request) {
  const denied = guard(request);
  if (denied) return denied;

  let R2 = (process.env as any).DATA_LAKE;
  let s3: S3Client | undefined = undefined;

  // If R2 binding is missing (e.g. Lovable deployment), fallback to standard S3 API using AWS credentials
  if (!R2) {
    const client = getClient();
    if (client) s3 = client;
  }

  if (!R2 && !s3) {
    return json({ ok: false, error: "Neither DATA_LAKE R2 binding nor S3 credentials found" }, 500);
  }

  try {
    // rt_snapshots is archived on-ingest. observed_arrivals stays here.
    const arrivals = await archiveTable("observed_arrivals", "last_seen_at", 24 * 60, R2, s3);

    return json({
      ok: true,
      message: "Data Lake archival completed",
      archived: {
        observed_arrivals: arrivals,
      },
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
