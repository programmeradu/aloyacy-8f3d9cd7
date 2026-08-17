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
 *
 * The wire parsing lives in ./http-parse so it is testable without a socket.
 */
import { connect } from "cloudflare:sockets";

import { CORS, concat, extractBody, guard } from "./http-parse";

const HOST = "20.19.98.194";
const PORT = 8328;
const PATH = "/Api/api/gtfs-realtime";
const TIMEOUT_MS = 12_000;

export interface Env {
  /** Optional. When set, callers must send Authorization: Bearer <token>. */
  RELAY_TOKEN?: string;
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

    return extractBody(concat(chunks));
  } finally {
    try {
      await socket.close();
    } catch {
      /* already closed */
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const blocked = guard(request, env.RELAY_TOKEN);
    if (blocked) return blocked;

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
