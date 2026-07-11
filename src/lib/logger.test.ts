import { describe, it, expect } from "vitest";
import {
  createLogger,
  buildRecord,
  safeStringify,
  serializeError,
  type LogLevel,
  type LogRecord,
} from "./logger";

const FROZEN = new Date("2026-08-22T14:02:00.000Z");
const now = () => FROZEN;

function capture(level?: LogLevel) {
  const lines: Array<{ level: LogLevel; record: LogRecord }> = [];
  const log = createLogger("gtfs", {
    level: level ?? "debug",
    now,
    sink: (lvl, line) => lines.push({ level: lvl, record: JSON.parse(line) as LogRecord }),
  });
  return { log, lines };
}

describe("buildRecord", () => {
  it("produces the documented wire shape", () => {
    expect(buildRecord("warn", "gtfs", "feed stale", { ageSec: 412 }, now)).toEqual({
      ts: "2026-08-22T14:02:00.000Z",
      level: "warn",
      scope: "gtfs",
      msg: "feed stale",
      ageSec: 412,
    });
  });

  it("does not let caller fields spoof reserved keys", () => {
    const record = buildRecord("info", "gtfs", "ok", { level: "error", ts: "nope" }, now);
    expect(record.level).toBe("info");
    expect(record.ts).toBe("2026-08-22T14:02:00.000Z");
  });
});

describe("safeStringify", () => {
  it("emits one line of JSON", () => {
    const line = safeStringify(buildRecord("info", "a", "b", undefined, now));
    expect(line.includes("\n")).toBe(false);
    expect(JSON.parse(line).msg).toBe("b");
  });

  it("survives circular references and BigInt", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const line = safeStringify(
      buildRecord("info", "a", "b", { cyclic, big: 9007199254740993n }, now),
    );
    const parsed = JSON.parse(line);
    expect(parsed.cyclic.self).toBe("[Circular]");
    expect(parsed.big).toBe("9007199254740993");
  });
});

describe("serializeError", () => {
  it("captures name, message and stack", () => {
    const fields = serializeError(new TypeError("boom")) as { err: Record<string, string> };
    expect(fields.err.name).toBe("TypeError");
    expect(fields.err.message).toBe("boom");
    expect(typeof fields.err.stack).toBe("string");
  });

  it("handles non-Error throws and undefined", () => {
    expect(serializeError("plain string")).toEqual({
      err: { name: "NonError", message: "plain string" },
    });
    expect(serializeError(undefined)).toEqual({});
  });
});

describe("createLogger", () => {
  it("routes each level to the sink with its level tag", () => {
    const { log, lines } = capture();
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(lines.map((l) => l.level)).toEqual(["debug", "info", "warn", "error"]);
  });

  it("filters below the configured minimum level", () => {
    const { log, lines } = capture("warn");
    log.debug("d");
    log.info("i");
    log.warn("w");
    expect(lines).toHaveLength(1);
    expect(lines[0].record.msg).toBe("w");
  });

  it("merges error and extra fields on error()", () => {
    const { log, lines } = capture();
    log.error("ingest failed", new Error("upstream 503"), { feed: "nicosia" });
    const record = lines[0].record as LogRecord & { err: { message: string }; feed: string };
    expect(record.err.message).toBe("upstream 503");
    expect(record.feed).toBe("nicosia");
    expect(record.scope).toBe("gtfs");
  });

  it("nests child scopes", () => {
    const { log, lines } = capture();
    log.child("nicosia").info("ingested", { trips: 812 });
    expect(lines[0].record.scope).toBe("gtfs:nicosia");
    expect(lines[0].record.trips).toBe(812);
  });
});
