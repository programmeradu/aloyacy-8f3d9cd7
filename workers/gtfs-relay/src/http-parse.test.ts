import { describe, expect, it } from "vitest";

import { CORS, concat, dechunk, extractBody, guard, indexOfSeq, parseHead } from "./http-parse";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("indexOfSeq", () => {
  it("finds a byte sequence", () => {
    expect(indexOfSeq(enc("abcdef"), [0x63, 0x64])).toBe(2);
  });

  it("returns -1 when absent", () => {
    expect(indexOfSeq(enc("abc"), [0x7a])).toBe(-1);
  });

  it("honours the start offset", () => {
    expect(indexOfSeq(enc("abab"), [0x61, 0x62], 1)).toBe(2);
  });

  it("does not match a partial sequence at the tail", () => {
    expect(indexOfSeq(enc("abc"), [0x63, 0x64])).toBe(-1);
  });
});

describe("concat", () => {
  it("joins chunks in order", () => {
    expect(dec(concat([enc("he"), enc("ll"), enc("o")]))).toBe("hello");
  });

  it("returns an empty buffer for no chunks", () => {
    expect(concat([]).byteLength).toBe(0);
  });
});

describe("dechunk", () => {
  it("reassembles a chunked body", () => {
    const body = enc("5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n");
    expect(dec(dechunk(body))).toBe("hello world");
  });

  it("ignores chunk extensions after the size", () => {
    expect(dec(dechunk(enc("3;foo=bar\r\nabc\r\n0\r\n\r\n")))).toBe("abc");
  });

  it("stops at a truncated frame instead of throwing", () => {
    expect(dec(dechunk(enc("5\r\nhello\r\n4\r\nab")))).toBe("helloab");
  });

  it("returns empty for garbage input", () => {
    expect(dechunk(enc("not-a-chunk")).byteLength).toBe(0);
  });
});

describe("parseHead", () => {
  it("reads the status and body offset", () => {
    const raw = enc("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nhi");
    const { status, bodyAt, head } = parseHead(raw);
    expect(status).toBe(200);
    expect(dec(raw.subarray(bodyAt))).toBe("hi");
    expect(head).toContain("Content-Length");
  });

  it("throws when the header block never terminates", () => {
    expect(() => parseHead(enc("HTTP/1.1 200 OK\r\n"))).toThrow(/malformed/);
  });
});

describe("extractBody", () => {
  it("returns an identity body", () => {
    expect(dec(extractBody(enc("HTTP/1.1 200 OK\r\n\r\nfeed-bytes")))).toBe("feed-bytes");
  });

  it("dechunks when the upstream says chunked", () => {
    const raw = enc("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nfeed\r\n0\r\n\r\n");
    expect(dec(extractBody(raw))).toBe("feed");
  });

  it("throws on a non-200 upstream", () => {
    expect(() => extractBody(enc("HTTP/1.1 503 Nope\r\n\r\nx"))).toThrow("upstream HTTP 503");
  });

  it("reports an unparseable status line as unknown", () => {
    expect(() => extractBody(enc("garbage\r\n\r\nx"))).toThrow("upstream HTTP ?");
  });

  it("throws on an empty body", () => {
    expect(() => extractBody(enc("HTTP/1.1 200 OK\r\n\r\n"))).toThrow("upstream empty body");
  });
});

describe("guard", () => {
  const req = (method: string, headers: Record<string, string> = {}) =>
    new Request("https://relay.test/", { method, headers });

  it("answers preflight with CORS", () => {
    const res = guard(req("OPTIONS"))!;
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      CORS["Access-Control-Allow-Origin"],
    );
  });

  it("rejects non-GET methods", () => {
    expect(guard(req("POST"))!.status).toBe(405);
  });

  it("allows GET when no token is configured", () => {
    expect(guard(req("GET"))).toBeNull();
  });

  it("rejects a missing or wrong bearer token", () => {
    expect(guard(req("GET"), "s3cret")!.status).toBe(401);
    expect(guard(req("GET", { authorization: "Bearer nope" }), "s3cret")!.status).toBe(401);
  });

  it("allows the correct bearer token", () => {
    expect(guard(req("GET", { authorization: "Bearer s3cret" }), "s3cret")).toBeNull();
  });
});
