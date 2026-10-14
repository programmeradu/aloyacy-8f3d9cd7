// Browser auth client (replaces supabase-js auth).
//
// The session lives in an HttpOnly cookie set by /api/public/auth/*; this
// module mirrors it in memory so UI code can read the user and pass the
// bearer where an API wants one. The method names and return shapes follow
// supabase-js so existing call sites keep working.

export type ClientUser = {
  id: string;
  email: string | null;
  is_anonymous: boolean;
  created_at: string;
  app_metadata: { provider?: string };
  user_metadata: Record<string, unknown>;
};
export type ClientSession = { access_token: string; token_type: "bearer"; expires_at: number; user: ClientUser };
export type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED";
type AuthError = { message: string; code?: string };

let current: ClientSession | null = null;
let loaded: Promise<ClientSession | null> | null = null;
const listeners = new Set<(e: AuthEvent, s: ClientSession | null) => void>();

function emit(e: AuthEvent) {
  for (const l of listeners) {
    try {
      l(e, current);
    } catch {
      /* listener errors never break auth */
    }
  }
}

async function call(path: string, init: RequestInit = {}): Promise<{ ok: boolean; body: any }> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  return { ok: res.ok, body };
}

function setSession(s: ClientSession | null, event: AuthEvent) {
  const changedUser = (current?.user.id ?? null) !== (s?.user.id ?? null);
  const changedState = current?.user.is_anonymous !== s?.user.is_anonymous;
  current = s;
  if (event === "SIGNED_OUT" || changedUser || changedState || event !== "TOKEN_REFRESHED") emit(event);
}

export function getAccessTokenSync(): string | null {
  return current?.access_token ?? null;
}

export const auth = {
  async getSession(): Promise<{ data: { session: ClientSession | null }; error: AuthError | null }> {
    if (typeof window === "undefined") return { data: { session: null }, error: null };
    if (!loaded) {
      loaded = call("/api/public/auth/session")
        .then(({ body }) => {
          current = (body?.session as ClientSession | null) ?? null;
          return current;
        })
        .catch(() => {
          loaded = null;
          return null;
        });
    }
    await loaded;
    return { data: { session: current }, error: null };
  },

  async getUser(): Promise<{ data: { user: ClientUser | null }; error: AuthError | null }> {
    const { data } = await auth.getSession();
    return { data: { user: data.session?.user ?? null }, error: null };
  },

  async signInAnonymously(): Promise<{ data: { session: ClientSession | null }; error: AuthError | null }> {
    const { ok, body } = await call("/api/public/auth/session", { method: "POST", body: "{}" });
    if (!ok || !body?.session) return { data: { session: null }, error: { message: body?.error ?? "sign-in failed" } };
    loaded = Promise.resolve(body.session);
    setSession(body.session, "SIGNED_IN");
    return { data: { session: current }, error: null };
  },

  async verifyOtp(args: { email: string; token: string; type?: string }): Promise<{
    data: { session: ClientSession | null; user: ClientUser | null };
    error: AuthError | null;
  }> {
    const { ok, body } = await call("/api/public/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email: args.email, token: args.token }),
    });
    if (!ok || !body?.session) {
      return { data: { session: null, user: null }, error: { message: body?.error ?? "Invalid code", code: body?.code } };
    }
    loaded = Promise.resolve(body.session);
    setSession(body.session, body.linked ? "USER_UPDATED" : "SIGNED_IN");
    return { data: { session: current, user: current?.user ?? null }, error: null };
  },

  async signInWithOtp(args: { email: string }): Promise<{ data: unknown; error: AuthError | null }> {
    const { ok, body } = await call("/api/public/auth/otp", { method: "POST", body: JSON.stringify({ email: args.email }) });
    return ok && body?.ok ? { data: {}, error: null } : { data: null, error: { message: body?.error ?? "Could not send code" } };
  },

  async signOut(): Promise<{ error: AuthError | null }> {
    await call("/api/public/auth/session", { method: "DELETE" }).catch(() => undefined);
    loaded = Promise.resolve(null);
    setSession(null, "SIGNED_OUT");
    return { error: null };
  },

  /** Password and OAuth identities were Supabase features; not offered here. */
  async updateUser(_args: unknown): Promise<{ data: null; error: AuthError }> {
    return { data: null, error: { message: "Password sign-in is not available. Use the email code instead." } };
  },
  async linkIdentity(_args: unknown): Promise<{ data: null; error: AuthError }> {
    return { data: null, error: { message: "Google sign-in is not available. Use the email code instead." } };
  },

  onAuthStateChange(cb: (e: AuthEvent, s: ClientSession | null) => void) {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },
};
