// Copies Storage buckets + objects from the hosted project to the
// self-hosted stack. Aloya only uses the public `schedule` bucket (the
// offline SQLite bundle the mobile app downloads), but this walks every
// bucket so nothing is left behind.
//
//   SOURCE_URL=https://<ref>.supabase.co SOURCE_SERVICE_KEY=... \
//   TARGET_URL=https://db.aloya.cy      TARGET_SERVICE_KEY=... \
//   bun deploy/supabase/copy-storage.ts

import { createClient } from "@supabase/supabase-js";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing ${k}`);
    process.exit(1);
  }
  return v;
};

const source = createClient(need("SOURCE_URL"), need("SOURCE_SERVICE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const target = createClient(need("TARGET_URL"), need("TARGET_SERVICE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Storage has no recursive list, so walk prefixes depth-first. */
async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await source.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders come back without an id.
      if (entry.id === null) out.push(...(await listAll(bucket, path)));
      else out.push(path);
    }
    if (data.length < 100) break;
    offset += data.length;
  }
  return out;
}

const { data: buckets, error: bucketErr } = await source.storage.listBuckets();
if (bucketErr) throw new Error(`listBuckets: ${bucketErr.message}`);

let copied = 0;
let failed = 0;

for (const bucket of buckets ?? []) {
  console.log(`\n=== ${bucket.name} (${bucket.public ? "public" : "private"}) ===`);

  const { error: createErr } = await target.storage.createBucket(bucket.name, {
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit ?? undefined,
    allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
  });
  // Re-runs hit "already exists", which is fine.
  if (createErr && !/exist/i.test(createErr.message)) {
    console.error(`  bucket create failed: ${createErr.message}`);
    continue;
  }

  const paths = await listAll(bucket.name);
  console.log(`  ${paths.length} object(s)`);

  for (const path of paths) {
    const { data: blob, error: dlErr } = await source.storage.from(bucket.name).download(path);
    if (dlErr || !blob) {
      console.error(`  ✗ ${path} — download: ${dlErr?.message}`);
      failed++;
      continue;
    }
    const { error: upErr } = await target.storage
      .from(bucket.name)
      .upload(path, blob, { upsert: true, contentType: blob.type || undefined });
    if (upErr) {
      console.error(`  ✗ ${path} — upload: ${upErr.message}`);
      failed++;
      continue;
    }
    copied++;
    console.log(`  ✓ ${path}`);
  }
}

console.log(`\nCopied ${copied} object(s), ${failed} failure(s).`);
if (failed > 0) process.exit(1);
