// supabase.storage replacement backed by R2.
//
// Objects live in the DATA_LAKE bucket under `<bucket>/<path>` (e.g.
// `schedule/stops.json`, `stop-photos/<stop>/<id>.jpg`). A dedicated binding
// named after the bucket in upper snake case (SCHEDULE, STOP_PHOTOS) wins when
// present. Public reads go through the Worker at /media/<bucket>/<path>
// (see src/server.ts), since a free-plan R2 bucket has no public URL by default.

import { getWorkerEnv } from "@/lib/worker-env";

export type R2Like = {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
    opts?: { httpMetadata?: { contentType?: string; cacheControl?: string; contentEncoding?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string; cacheControl?: string; contentEncoding?: string };
    httpEtag?: string;
    json<T>(): Promise<T>;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  } | null>;
  head?(key: string): Promise<unknown | null>;
  delete(keys: string | string[]): Promise<void>;
};

/** Buckets that may be served publicly through /media/<bucket>/... */
export const PUBLIC_BUCKETS = new Set(["schedule", "stop-photos"]);

export function bucketBinding(bucket: string): { r2: R2Like; prefix: string } | null {
  const env = (getWorkerEnv() ?? {}) as Record<string, unknown>;
  const own = env[bucket.toUpperCase().replace(/[^A-Z0-9]/g, "_")] as R2Like | undefined;
  if (own && typeof own.put === "function") return { r2: own, prefix: "" };
  const lake = env.DATA_LAKE as R2Like | undefined;
  if (lake && typeof lake.put === "function") return { r2: lake, prefix: `${bucket}/` };
  return null;
}

function publicOrigin(): string {
  return (process.env.PUBLIC_SITE_URL || "https://app.aloya.cy").replace(/\/+$/, "");
}

type StorageError = { message: string; statusCode?: string };

function bucketApi(bucket: string) {
  const missing = (): StorageError => ({ message: "R2 binding DATA_LAKE is not configured", statusCode: "500" });
  return {
    async upload(
      path: string,
      body: ArrayBuffer | ArrayBufferView | string | Blob,
      opts?: { contentType?: string; upsert?: boolean; cacheControl?: string },
    ) {
      const b = bucketBinding(bucket);
      if (!b) return { data: null, error: missing() };
      try {
        await b.r2.put(`${b.prefix}${path}`, body, {
          httpMetadata: {
            contentType: opts?.contentType,
            cacheControl: opts?.cacheControl ? `max-age=${opts.cacheControl}` : undefined,
          },
        });
        return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    async download(path: string) {
      const b = bucketBinding(bucket);
      if (!b) return { data: null, error: missing() };
      const obj = await b.r2.get(`${b.prefix}${path}`);
      if (!obj) return { data: null, error: { message: "Object not found", statusCode: "404" } };
      return { data: new Blob([await obj.arrayBuffer()]), error: null };
    },
    async remove(paths: string[]) {
      const b = bucketBinding(bucket);
      if (!b) return { data: null, error: missing() };
      await b.r2.delete(paths.map((p) => `${b.prefix}${p}`));
      return { data: paths.map((name) => ({ name })), error: null };
    },
    getPublicUrl(path: string) {
      return { data: { publicUrl: `${publicOrigin()}/media/${bucket}/${path}` } };
    },
  };
}

export const storage = {
  from: bucketApi,
  // Buckets are prefixes in R2: they always "exist".
  async getBucket(id: string) {
    return { data: { id, name: id, public: PUBLIC_BUCKETS.has(id) }, error: null };
  },
  async createBucket(id: string, _opts?: unknown) {
    return { data: { name: id }, error: null };
  },
};

/** Serve /media/<bucket>/<path> from R2 (public buckets only). */
export async function serveMedia(pathname: string): Promise<Response | null> {
  const m = /^\/media\/([a-z0-9-]+)\/(.+)$/.exec(pathname);
  if (!m) return null;
  const [, bucket, key] = m;
  if (!PUBLIC_BUCKETS.has(bucket!) || key!.includes("..")) return new Response("Not found", { status: 404 });
  const b = bucketBinding(bucket!);
  if (!b) return new Response("Not found", { status: 404 });
  const obj = await b.r2.get(`${b.prefix}${decodeURIComponent(key!)}`);
  if (!obj) return new Response("Not found", { status: 404 });
  const h = new Headers();
  if (obj.httpMetadata?.contentType) h.set("content-type", obj.httpMetadata.contentType);
  if (obj.httpMetadata?.contentEncoding) h.set("content-encoding", obj.httpMetadata.contentEncoding);
  h.set("cache-control", obj.httpMetadata?.cacheControl || "public, max-age=3600");
  h.set("access-control-allow-origin", "*");
  if (obj.httpEtag) h.set("etag", obj.httpEtag);
  return new Response(obj.body, { headers: h });
}
