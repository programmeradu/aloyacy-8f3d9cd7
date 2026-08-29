import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "@/lib/logger";

const log = createLogger("lake");

let _s3: S3Client | null = null;

export function getClient(): S3Client | null {
  if (_s3) return _s3;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (accountId && accessKeyId && secretAccessKey) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    return _s3;
  }
  return null;
}

/**
 * Streams an array of objects to the R2 data lake as a JSONL file.
 * Key pattern: `<prefix>/YYYY-MM-DD/<timestamp>.jsonl`
 * 
 * Safe to fire-and-forget; handles its own errors so the caller is not blocked.
 */
export async function streamToLake(prefix: string, data: any[]): Promise<boolean> {
  if (!data || data.length === 0) return false;

  const s3 = getClient();
  if (!s3) {
    // Silenced so we don't spam logs in dev/CI where R2 isn't configured
    return false;
  }

  try {
    const jsonl = data.map((row) => JSON.stringify(row)).join("\n");
    
    const now = new Date();
    // format as YYYY-MM-DD
    const dateStr = now.toISOString().split("T")[0];
    const timestamp = now.getTime();
    
    const objectKey = `${prefix}/${dateStr}/${timestamp}.jsonl`;

    await s3.send(
      new PutObjectCommand({
        Bucket: "aloya-data-lake",
        Key: objectKey,
        Body: jsonl,
        ContentType: "application/jsonl",
      })
    );
    
    log.info(`Archived ${data.length} rows to ${objectKey}`);
    return true;
  } catch (error) {
    log.error(`Failed to stream to data lake for prefix ${prefix}`, error);
    return false;
  }
}
