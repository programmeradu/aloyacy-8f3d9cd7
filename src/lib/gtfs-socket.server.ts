// Raw-TCP fetch for the Cyprus GTFS-realtime feed.
//
// Why this exists: the upstream lives at http://20.19.98.194:8328. Cloudflare
// Workers refuse `fetch()` to arbitrary ports — only a small allow-list of
// HTTP ports (80, 8080, 8880, 2052, 2082, 2086, 2095) is permitted, and
// everything else is rejected at the edge. That rejection is what we have
// been reading as a "403 from the upstream": the request never leaves
// Cloudflare at all.
//
// Workers *can* open raw TCP sockets to any port via `cloudflare:sockets`,
// so we speak HTTP/1.1 by hand over a socket and read the protobuf body.
// Outside Workers (local dev on Node) the module is unavailable and we fall
// back to a plain fetch, which works fine there.

const HOST = "20.19.98.194";
const PORT = 8328;
const PATH = "/Api/api/gtfs-realtime";

type CfSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => Promise<void>;
};

async function getConnect(): Promise<
  ((addr: { hostname: string; port: number }) => CfSocket) | null
> {
  try {
    // Bare specifier only resolvable inside the Workers runtime.
    const mod = (await import(
      /* @vite-ignore */ "cloudflare:sockets"
    )) as unknown as { connect: (a: { hostname: string; port: number }) => CfSocket };
    return typeof mod?.connect === "function" ? mod.connect : null;
  } catch {
    return null;
  }
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
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** Decode an HTTP/1.1 chunked body. */
function dechunk(body: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let pos = 0;
  while (pos < body.length) {
    const crlf = indexOfSeq(body, [0x0d, 0x0a], pos);
    if (crlf < 0) break;
    const sizeHex = new TextDecoder()
      .decode(body.subarray(pos, crlf))
      .split(";")[0]!
      .trim();
    const size = parseInt(sizeHex, 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const start = crlf + 2;
    parts.push(body.subarray(start, start + size));
    pos = start + size + 2; // trailing CRLF
  }
  return concat(parts);
}

/**
 * Fetch the feed bytes over a raw TCP socket (Workers) or plain fetch (Node).
 * Throws on any transport or HTTP-level failure so the caller can fall through
 * to the next source.
 */
export async function fetchFeedOverSocket(
  timeoutMs = 12_000,
): Promise<Uint8Array> {
  const connect = await getConnect();
  if (!connect) {
    const res = await fetch(`http://${HOST}:${PORT}${PATH}`, {
      headers: { Accept: "application/octet-stream" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`direct ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  const socket = connect({ hostname: HOST, port: PORT });
  const deadline = Date.now() + timeoutMs;
  try {
    const writer = socket.writable.getWriter();
    const req =
      `GET ${PATH} HTTP/1.1\r\n` +
      `Host: ${HOST}:${PORT}\r\n` +
      `Accept: application/octet-stream\r\n` +
      `User-Agent: Aloya/1.0 (+https://app.aloya.cy)\r\n` +
      `Connection: close\r\n\r\n`;
    await writer.write(new TextEncoder().encode(req));
    writer.releaseLock();

    const reader = socket.readable.getReader();
    const chunks: Uint8Array[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() > deadline) throw new Error("socket timeout");
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const raw = concat(chunks);
    const headEnd = indexOfSeq(raw, [0x0d, 0x0a, 0x0d, 0x0a]);
    if (headEnd < 0) throw new Error("malformed HTTP response");

    const head = new TextDecoder().decode(raw.subarray(0, headEnd));
    const statusLine = head.split("\r\n")[0] ?? "";
    const status = Number(statusLine.split(" ")[1] ?? 0);
    if (status !== 200) throw new Error(`socket HTTP ${status || "?"}`);

    let body = raw.subarray(headEnd + 4);
    if (/transfer-encoding:\s*chunked/i.test(head)) body = dechunk(body);
    if (body.byteLength === 0) throw new Error("socket empty body");
    return body;
  } finally {
    try {
      await socket.close();
    } catch {
      /* already closed */
    }
  }
}
