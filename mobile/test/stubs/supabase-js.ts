// In-memory stand-in for @supabase/supabase-js.
//
// The real SDK pulls in Node/RN-only transports and a websocket client, which
// cannot boot inside this harness. This stub reproduces just the surface the
// app touches — auth session/user reads, OTP verification, sign-out, the auth
// state listener, and the `from(...).insert/select/update/upsert/delete`
// builder — and records every call so suites can assert on payloads.
//
// Tests drive it through the `__supabase()` handle: set the session, queue a
// response for the next query, then inspect what the module under test sent.

export type StubUser = { id: string; email?: string } & Record<string, unknown>;
export type StubSession = { access_token: string; user: StubUser } & Record<string, unknown>;

type QueryRecord = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
};

type Response = { data: unknown; error: { message: string } | null };

type State = {
  session: StubSession | null;
  queries: QueryRecord[];
  responses: Response[];
  defaultResponse: Response;
  authListeners: Array<(event: string, session: StubSession | null) => void>;
  signOutCount: number;
  verifyOtpCalls: unknown[];
  verifyOtpResult: { data: { session: StubSession | null }; error: { message: string } | null };
};

const g = globalThis as typeof globalThis & { __aloyaSupabase?: State };

function fresh(): State {
  return {
    session: null,
    queries: [],
    responses: [],
    defaultResponse: { data: null, error: null },
    authListeners: [],
    signOutCount: 0,
    verifyOtpCalls: [],
    verifyOtpResult: { data: { session: null }, error: null },
  };
}

export function __supabase(): State {
  return (g.__aloyaSupabase ??= fresh());
}

export function __resetSupabase(): State {
  g.__aloyaSupabase = fresh();
  return g.__aloyaSupabase;
}

/** Queue the result the next query builder should resolve with. */
export function __queueResponse(data: unknown, error: { message: string } | null = null) {
  __supabase().responses.push({ data, error });
}

export function __setSession(session: StubSession | null) {
  __supabase().session = session;
}

function nextResponse(): Response {
  const s = __supabase();
  return s.responses.shift() ?? s.defaultResponse;
}

class QueryBuilder implements PromiseLike<Response> {
  private record: QueryRecord;

  constructor(table: string) {
    this.record = { table, op: "select", filters: [] };
    __supabase().queries.push(this.record);
  }

  private op(op: QueryRecord["op"], payload?: unknown) {
    this.record.op = op;
    this.record.payload = payload;
    return this;
  }

  select(payload?: unknown) {
    return this.op("select", payload);
  }
  insert(payload: unknown) {
    return this.op("insert", payload);
  }
  update(payload: unknown) {
    return this.op("update", payload);
  }
  upsert(payload: unknown) {
    return this.op("upsert", payload);
  }
  delete() {
    return this.op("delete");
  }

  eq(col: string, val: unknown) {
    this.record.filters.push(["eq", col, val]);
    return this;
  }
  neq(col: string, val: unknown) {
    this.record.filters.push(["neq", col, val]);
    return this;
  }
  gt(col: string, val: unknown) {
    this.record.filters.push(["gt", col, val]);
    return this;
  }
  gte(col: string, val: unknown) {
    this.record.filters.push(["gte", col, val]);
    return this;
  }
  lt(col: string, val: unknown) {
    this.record.filters.push(["lt", col, val]);
    return this;
  }
  lte(col: string, val: unknown) {
    this.record.filters.push(["lte", col, val]);
    return this;
  }
  in(col: string, val: unknown) {
    this.record.filters.push(["in", col, val]);
    return this;
  }
  order(col: string, val?: unknown) {
    this.record.filters.push(["order", col, val]);
    return this;
  }
  limit(n: number) {
    this.record.filters.push(["limit", String(n), n]);
    return this;
  }
  single() {
    this.record.filters.push(["single", "", true]);
    return this;
  }
  maybeSingle() {
    this.record.filters.push(["maybeSingle", "", true]);
    return this;
  }

  then<R1 = Response, R2 = never>(
    onfulfilled?: ((value: Response) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(nextResponse()).then(onfulfilled, onrejected);
  }
}

function makeChannel() {
  const channel = {
    on: () => channel,
    subscribe: (cb?: (status: string) => void) => {
      cb?.("SUBSCRIBED");
      return channel;
    },
    send: async () => "ok",
    unsubscribe: async () => "ok",
  };
  return channel;
}

export function createClient(_url: string, _key: string, _opts?: unknown) {
  return {
    auth: {
      async getSession() {
        return { data: { session: __supabase().session }, error: null };
      },
      async getUser() {
        return { data: { user: __supabase().session?.user ?? null }, error: null };
      },
      async verifyOtp(args: unknown) {
        const s = __supabase();
        s.verifyOtpCalls.push(args);
        if (s.verifyOtpResult.data.session) s.session = s.verifyOtpResult.data.session;
        return s.verifyOtpResult;
      },
      async signOut() {
        const s = __supabase();
        s.signOutCount += 1;
        s.session = null;
        for (const l of s.authListeners) l("SIGNED_OUT", null);
        return { error: null };
      },
      async setSession(session: StubSession) {
        __supabase().session = session;
        return { data: { session }, error: null };
      },
      onAuthStateChange(cb: (event: string, session: StubSession | null) => void) {
        const s = __supabase();
        s.authListeners.push(cb);
        return {
          data: {
            subscription: {
              unsubscribe() {
                s.authListeners = s.authListeners.filter((l) => l !== cb);
              },
            },
          },
        };
      },
    },
    from(table: string) {
      return new QueryBuilder(table);
    },
    async rpc(_fn: string, _args?: unknown) {
      return nextResponse();
    },
    channel: () => makeChannel(),
    removeChannel: async () => "ok",
    functions: { invoke: async () => nextResponse() },
    storage: { from: () => ({ upload: async () => nextResponse() }) },
  };
}

export type SupabaseClient = ReturnType<typeof createClient>;
export type Session = StubSession;
export type User = StubUser;
