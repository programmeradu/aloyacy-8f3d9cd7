// Own auth on D1, replacing Supabase GoTrue.
//
//  * Anonymous device session: on first visit the rider gets a `users` row
//    (is_anonymous = 1) and a signed session token (HS256, JWT_SECRET).
//    Web keeps it in an HttpOnly cookie; mobile sends it as a Bearer token.
//  * Email OTP: 6-digit code, stored hashed in auth_otp_codes (15 min, 5
//    attempts), delivered by the existing sender in auth-email.server.ts.
//    Verifying an email nobody owns yet upgrades the caller's anonymous user
//    in place (same user id, so cloud data follows), like Supabase's
//    linkIdentity flow did. An email that already has an account signs in to
//    that account.
//
// Tokens are stateless; signing out clears the cookie on this device only.

import { getD1 } from "@/lib/db/d1";

export const SESSION_COOKIE = "aloya_session";
const SESSION_TTL_SEC = 365 * 24 * 3600;
const OTP_TTL_MS = 15 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

export type AuthUser = {
  id: string;
  email: string | null;
  is_anonymous: boolean;
  created_at: string;
  /** Kept so code written against Supabase's User keeps working. */
  app_metadata: { provider?: string };
  user_metadata: Record<string, unknown>;
};

export type Claims = { sub: string; is_anonymous: boolean; email?: string | null; iat: number; exp: number };

export type Session = { access_token: string; token_type: "bearer"; expires_at: number; user: AuthUser };

// ---- crypto -----------------------------------------------------------------
const enc = new TextEncoder();

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET is not set (needs at least 32 characters)");
  return s;
}

function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? enc.encode(bytes) : bytes;
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

let keyCache: { s: string; k: CryptoKey } | null = null;
async function hmacKey(): Promise<CryptoKey> {
  const s = secret();
  if (keyCache?.s === s) return keyCache.k;
  const k = await crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
  keyCache = { s, k };
  return k;
}

export async function signToken(claims: Omit<Claims, "iat" | "exp">, ttlSec = SESSION_TTL_SEC): Promise<{ token: string; exp: number }> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSec;
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...claims, iat, exp, iss: "aloya" }));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(`${head}.${body}`)));
  return { token: `${head}.${body}.${b64url(sig)}`, exp };
}

export async function verifyToken(token: string | null | undefined): Promise<Claims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [head, body, sig] = parts as [string, string, string];
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), unb64url(sig), enc.encode(`${head}.${body}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(body))) as Claims & { iss?: string };
    if (claims.iss !== "aloya" || !claims.sub) return null;
    if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}

async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- users ------------------------------------------------------------------
type UserRow = { id: string; email: string | null; is_anonymous: number; created_at: string };

function toUser(r: UserRow): AuthUser {
  const anon = r.is_anonymous === 1;
  return {
    id: r.id,
    email: r.email,
    is_anonymous: anon,
    created_at: r.created_at,
    app_metadata: anon ? {} : { provider: "email" },
    user_metadata: {},
  };
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const r = await getD1()
    .prepare(`SELECT id, email, is_anonymous, created_at FROM users WHERE id = ?`)
    .bind(id)
    .first<UserRow>();
  return r ? toUser(r) : null;
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const r = await getD1()
    .prepare(`SELECT id, email, is_anonymous, created_at FROM users WHERE email = ? COLLATE NOCASE`)
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
  return r ? toUser(r) : null;
}

export async function createUser(opts: { email?: string | null } = {}): Promise<AuthUser> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const email = opts.email?.trim().toLowerCase() ?? null;
  const r = await getD1()
    .prepare(
      `INSERT INTO users (id, email, is_anonymous, email_confirmed_at, created_at, updated_at, last_sign_in_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, email, is_anonymous, created_at`,
    )
    .bind(id, email, email ? 0 : 1, email ? now : null, now, now, now)
    .first<UserRow>();
  return toUser(r!);
}

/** Attach a verified email to a user (anonymous -> permanent). */
export async function attachEmail(userId: string, email: string): Promise<AuthUser | null> {
  const now = new Date().toISOString();
  const r = await getD1()
    .prepare(
      `UPDATE users SET email = ?, is_anonymous = 0, email_confirmed_at = ?, updated_at = ?, last_sign_in_at = ?
        WHERE id = ? RETURNING id, email, is_anonymous, created_at`,
    )
    .bind(email.trim().toLowerCase(), now, now, now, userId)
    .first<UserRow>();
  return r ? toUser(r) : null;
}

export async function sessionFor(user: AuthUser): Promise<Session> {
  const { token, exp } = await signToken({ sub: user.id, is_anonymous: user.is_anonymous, email: user.email });
  return { access_token: token, token_type: "bearer", expires_at: exp, user };
}

// ---- request plumbing -------------------------------------------------------
export function tokenFromRequest(req: Request | undefined | null): string | null {
  if (!req) return null;
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) {
    const t = h.slice(7).trim();
    if (t && t.split(".").length === 3) return t;
  }
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function claimsFromRequest(req: Request | undefined | null): Promise<Claims | null> {
  return verifyToken(tokenFromRequest(req));
}

export function sessionCookie(token: string, req?: Request | null): string {
  const secure = !req || new URL(req.url).protocol === "https:";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

/** Current session, or a fresh anonymous one when `create` and none is valid. */
export async function resolveSession(req: Request, create: boolean): Promise<{ session: Session | null; created: boolean }> {
  const claims = await claimsFromRequest(req);
  if (claims) {
    const user = await getUserById(claims.sub);
    if (user) {
      const token = tokenFromRequest(req)!;
      // Re-issue when the account state changed (e.g. email linked on another surface).
      if (user.is_anonymous !== claims.is_anonymous || claims.exp - Date.now() / 1000 < 30 * 24 * 3600) {
        return { session: await sessionFor(user), created: false };
      }
      return { session: { access_token: token, token_type: "bearer", expires_at: claims.exp, user }, created: false };
    }
  }
  if (!create) return { session: null, created: false };
  const user = await createUser();
  return { session: await sessionFor(user), created: true };
}

// ---- OTP --------------------------------------------------------------------
function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, "0");
}

async function codeHash(email: string, code: string): Promise<string> {
  return sha256(`${email}:${code}:${secret()}`);
}

/** Mint (and store) a code for `email`. Returns the plain code for the mailer. */
export async function issueOtp(
  rawEmail: string,
  opts: { linkUserId?: string | null } = {},
): Promise<{ code: string; isNewUser: boolean }> {
  const email = rawEmail.trim().toLowerCase();
  const code = sixDigits();
  const existing = await getUserByEmail(email);
  await getD1()
    .prepare(
      `INSERT INTO auth_otp_codes (email, code_hash, user_id, purpose, attempts, expires_at, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, user_id = excluded.user_id,
         purpose = excluded.purpose, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`,
    )
    .bind(
      email,
      await codeHash(email, code),
      opts.linkUserId ?? null,
      opts.linkUserId ? "link" : "signin",
      Date.now() + OTP_TTL_MS,
      new Date().toISOString(),
    )
    .run();
  return { code, isNewUser: !existing };
}

export type VerifyResult =
  | { ok: true; session: Session; linked: boolean }
  | { ok: false; error: string; code: "invalid" | "expired" | "too_many_attempts" };

/**
 * Check a code. `currentUserId` is the caller's session user (usually
 * anonymous): a brand-new email is attached to it so its data is kept.
 */
export async function verifyOtp(rawEmail: string, code: string, currentUserId?: string | null): Promise<VerifyResult> {
  const email = rawEmail.trim().toLowerCase();
  const d1 = getD1();
  const row = await d1
    .prepare(`SELECT code_hash, user_id, attempts, expires_at FROM auth_otp_codes WHERE email = ?`)
    .bind(email)
    .first<{ code_hash: string; user_id: string | null; attempts: number; expires_at: number }>();
  if (!row) return { ok: false, error: "Code is invalid or has expired.", code: "invalid" };
  if (row.expires_at < Date.now()) {
    await d1.prepare(`DELETE FROM auth_otp_codes WHERE email = ?`).bind(email).run();
    return { ok: false, error: "Code has expired. Request a new one.", code: "expired" };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new code.", code: "too_many_attempts" };
  }
  if (!safeEqual(row.code_hash, await codeHash(email, String(code).trim()))) {
    await d1.prepare(`UPDATE auth_otp_codes SET attempts = attempts + 1 WHERE email = ?`).bind(email).run();
    return { ok: false, error: "Code is invalid or has expired.", code: "invalid" };
  }
  await d1.prepare(`DELETE FROM auth_otp_codes WHERE email = ?`).bind(email).run();

  const owner = await getUserByEmail(email);
  if (owner) {
    await d1
      .prepare(`UPDATE users SET last_sign_in_at = ?, email_confirmed_at = COALESCE(email_confirmed_at, ?) WHERE id = ?`)
      .bind(new Date().toISOString(), new Date().toISOString(), owner.id)
      .run();
    return { ok: true, session: await sessionFor({ ...owner, is_anonymous: false }), linked: false };
  }
  const target = row.user_id ?? currentUserId ?? null;
  if (target) {
    const u = await getUserById(target);
    if (u?.is_anonymous) {
      const linked = await attachEmail(u.id, email);
      if (linked) return { ok: true, session: await sessionFor(linked), linked: true };
    }
  }
  const created = await createUser({ email });
  return { ok: true, session: await sessionFor(created), linked: false };
}
