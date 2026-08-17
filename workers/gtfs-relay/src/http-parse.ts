/**
 * Hand-rolled HTTP/1.1 response parsing for the raw-socket relay.
 *
 * The upstream feed listens on a port Cloudflare's `fetch()` refuses to dial,
 * so the relay speaks HTTP over a TCP socket and has to parse the wire format
 * itself. That parsing is pure byte work, kept here so it can be exercised
 * without a socket.
 */

/** Index of `needle` within `hay`, or -1. Byte-wise `indexOf`. */
export function indexOfSeq(hay: Uint8Array, needle: number[], from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Flatten socket chunks into one contiguous buffer. */
export function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * Reassemble a `Transfer-Encoding: chunked` body. Stops at the terminating
 * zero-length chunk, at a truncated frame, or at any unparseable size line —
 * a partial feed is better than throwing away the bytes we did receive.
 */
export function dechunk(body: Uint8Array): Uint8Array {
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

/** Status line + header block of an HTTP/1.1 response. */
export function parseHead(raw: Uint8Array): { head: string; status: number; bodyAt: number } {
  const headEnd = indexOfSeq(raw, [0x0d, 0x0a, 0x0d, 0x0a]);
  if (headEnd < 0) throw new Error("malformed upstream response");
  const head = new TextDecoder().decode(raw.subarray(0, headEnd));
  const status = Number((head.split("\r\n")[0] ?? "").split(" ")[1] ?? 0);
  return { head, status, bodyAt: headEnd + 4 };
}

/** Full response → feed bytes, throwing the same errors the relay surfaces. */
export function extractBody(raw: Uint8Array): Uint8Array {
  const { head, status, bodyAt } = parseHead(raw);
  if (status !== 200) throw new Error(`upstream HTTP ${status || "?"}`);
  let body = raw.subarray(bodyAt);
  if (/transfer-encoding:\s*chunked/i.test(head)) body = dechunk(body);
  if (body.byteLength === 0) throw new Error("upstream empty body");
  return body;
}

/** Shared CORS headers for every relay response, including failures. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

/**
 * Method + bearer-token gate. Returns the response to send back, or null when
 * the request may proceed to the upstream read.
 */
export function guard(request: Request, token?: string): Response | null {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")
    return new Response("Method not allowed", { status: 405, headers: CORS });
  if (token && (request.headers.get("authorization") ?? "") !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }
  return null;
}
