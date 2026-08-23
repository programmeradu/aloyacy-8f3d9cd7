// Structured logging for the server boundary — a deliberate, dependency-free
// implementation of the pino/bunyan line format (one JSON object per line,
// `level`/`ts`/`msg` reserved keys, child loggers via scope suffixes).
//
// Why not pino itself: pino's transports, worker threads and process/stream
// plumbing assume a Node host. This app's server code runs on Cloudflare
// workerd, where those paths are stubbed or absent. What matters operationally
// is the *shape* of the line, and `tests/server-logging.test.ts` is the
// enforcement mechanism: it asserts the wire shape and that no server module
// falls back to bare console logging.
//
// The app runs on a Worker runtime, so a heavyweight Node logger (pino with
// transports, file streams, worker threads) is not an option — but the thing
// that actually matters for operations is the *shape* of the line, not the
// library. Every log is a single JSON object on one line so Cloudflare /
// container log search can filter by `level`, `scope`, or any field:
//
//   {"ts":"2026-08-22T14:02:00.000Z","level":"warn","scope":"gtfs","msg":"feed stale","ageSec":412}
//
// Usage:
//   const log = createLogger("gtfs");
//   log.info("feed ingested", { trips: 812 });
//   log.error("ingest failed", err, { feed: "nicosia" });

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface LogRecord extends LogFields {
  ts: string;
  level: LogLevel;
  scope: string;
  msg: string;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Sink = (level: LogLevel, line: string) => void;

export interface LoggerOptions {
  /** Minimum level to emit. Defaults to `debug` in dev, `info` otherwise. */
  level?: LogLevel;
  /** Where lines go. Defaults to the console. Injected in tests. */
  sink?: Sink;
  /** Frozen clock for deterministic tests. */
  now?: () => Date;
}

/** Serialise an unknown thrown value into log-safe fields. */
export function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        ...(err.cause !== undefined ? { cause: String(err.cause) } : {}),
      },
    };
  }
  if (err === undefined) return {};
  return { err: { name: "NonError", message: String(err) } };
}

/**
 * Build the record without emitting it. Exported so tests (and future
 * transports) can assert the exact wire shape.
 */
export function buildRecord(
  level: LogLevel,
  scope: string,
  msg: string,
  fields: LogFields | undefined,
  now: () => Date,
): LogRecord {
  // Reserved keys win so a caller field can never spoof `level` or `ts`.
  return { ...(fields ?? {}), ts: now().toISOString(), level, scope, msg };
}

/** JSON.stringify that survives circular references and BigInt. */
export function safeStringify(record: LogRecord): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(record, (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
}

const consoleSink: Sink = (level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  /** `err` may be any thrown value; it is serialised into an `err` object. */
  error(msg: string, err?: unknown, fields?: LogFields): void;
  /** Derive a logger that appends to the scope, e.g. "gtfs:nicosia". */
  child(scope: string): Logger;
}

function defaultLevel(): LogLevel {
  const explicit = typeof process !== "undefined" ? process.env?.LOG_LEVEL : undefined;
  if (explicit && explicit in LEVEL_RANK) return explicit as LogLevel;
  const env = typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
  return env === "production" ? "info" : "debug";
}

export function createLogger(scope: string, options: LoggerOptions = {}): Logger {
  const min = LEVEL_RANK[options.level ?? defaultLevel()];
  const sink = options.sink ?? consoleSink;
  const now = options.now ?? (() => new Date());

  const emit = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (LEVEL_RANK[level] < min) return;
    sink(level, safeStringify(buildRecord(level, scope, msg, fields, now)));
  };

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, err, fields) => emit("error", msg, { ...serializeError(err), ...(fields ?? {}) }),
    child: (childScope) => createLogger(`${scope}:${childScope}`, { ...options, sink, now }),
  };
}

/** Root logger for code without a more specific scope. */
export const logger = createLogger("app");
