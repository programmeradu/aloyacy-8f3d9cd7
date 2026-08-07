/**
 * Aloya GTFS-realtime relay — standalone Cloudflare Worker.
 *
 * Deploy this on YOUR OWN Cloudflare account, then point the app at it by
 * setting the GTFS_RELAY_URL secret to the deployed URL.
 *
 * Why a socket instead of fetch(): the Cyprus upstream listens on port 8328,
 * and Cloudflare's fetch() only dials an allow-list of HTTP ports (80, 8080,
 * 8880, 2052, 2082, 2086, 2095). Any other port is refused at the edge — that
 * is the "403" we kept seeing. Raw TCP via cloudflare:sockets has no such
 * restriction, so we speak HTTP/1.1 by hand.
 */
import { connect } from "cloudflare:sockets";

const HOST = "20.19.98.194";
const PORT = 8328;
const PATH = "/Api/api/gtfs-realtime";
const TIMEOUT_MS = 12_000;

export interface Env {
  /** Optional. When set, callers must send Authorization: Bearer <token>. */
  RELAY_TOKEN?: string;
}

function indexOfSeq(hay: Uint8Array, needle: number[], from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function dechunk(body: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let pos = 0;
  while (pos < body.length) {
    const crlf = indexOfSeq(body, [0x0d, 0x0a], pos);
    if (crlf < 0) break;
    const size = parseInt(
      new TextDecoder().decode(body.subarray(pos, crlf)).split(";")[0]!.trim(),
      16,
    );
    if (!Number.isFinite(size) || size <= 0) break;
    const start = crlf + 2;
    parts.push(body.subarray(start, start + size));
    pos = start + size + 2;
  }
  return concat(parts);
}

async function readFeed(): Promise<Uint8Array> {
  const socket = connect({ hostname: HOST, port: PORT });
  const deadline = Date.now() + TIMEOUT_MS;
  try {
    const writer = socket.writable.getWriter();
    await writer.write(
      new TextEncoder().encode(
        `GET ${PATH} HTTP/1.1\r\nHost: ${HOST}:${PORT}\r\n` +
          `Accept: application/octet-stream\r\n` +
          `User-Agent: Aloya-Relay/1.0\r\nConnection: close\r\n\r\n`,
      ),
    );
    writer.releaseLock();

    const reader = socket.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      if (Date.now() > deadline) throw new Error("upstream timeout");
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    const raw = concat(chunks);
    const headEnd = indexOfSeq(raw, [0x0d, 0x0a, 0x0d, 0x0a]);
    if (headEnd < 0) throw new Error("malformed upstream response");
    const head = new TextDecoder().decode(raw.subarray(0, headEnd));
    const status = Number((head.split("\r\n")[0] ?? "").split(" ")[1] ?? 0);
    if (status !== 200) throw new Error(`upstream HTTP ${status || "?"}`);

    let body = raw.subarray(headEnd + 4);
    if (/transfer-encoding:\s*chunked/i.test(head)) body = dechunk(body);
    if (body.byteLength === 0) throw new Error("upstream empty body");
    return body;
  } finally {
    try {
      await socket.close();
    } catch {
      /* already closed */
    }
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS });
    }
    if (env.RELAY_TOKEN) {
      const auth = request.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${env.RELAY_TOKEN}`) {
        return new Response("Unauthorized", { status: 401, headers: CORS });
      }
    }
    try {
      const bytes = await readFeed();
      return new Response(bytes, {
        headers: {
          ...CORS,
          "Content-Type": "application/octet-stream",
          "Cache-Control": "public, max-age=5",
        },
      });
    } catch (e) {
      return new Response(e instanceof Error ? e.message : "relay failed", {
        status: 502,
        headers: { ...CORS, "Content-Type": "text/plain" },
      });
    }
  },
};
