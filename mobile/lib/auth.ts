// Aloya sessions for mobile — anonymous first, email optional.
//
// On first use the device gets a guest session from POST /api/public/auth/session
// (no email, no wall). The token is kept in AsyncStorage and sent as
// `Authorization: Bearer` to every authenticated endpoint. Signing in with an
// email is optional: the server mints and emails an 8-digit code
// (/api/public/auth/otp) and we verify it at /api/public/auth/verify. A new
// email is attached to the current guest user, so its data follows.
//
// We DO NOT use magic links on device — tapping a link in Mail opens a
// browser, not the app, which breaks the session hand-off.

import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchPublicApi } from "./api";

export const OTP_LENGTH = 8;
const STORAGE_KEY = "aloya.session.v1";

export type User = { id: string; email: string | null; is_anonymous: boolean; created_at?: string };
export type Session = { access_token: string; token_type: "bearer"; expires_at: number; user: User };

let current: Session | null = null;
let loaded = false;
let pending: Promise<Session | null> | null = null;
const listeners = new Set<(s: Session | null) => void>();

function emit(s: Session | null) {
  current = s;
  for (const l of listeners) l(s);
}

async function persist(s: Session | null) {
  emit(s);
  try {
    if (s) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage failures only cost a fresh guest session next launch.
  }
}

async function loadStored(): Promise<Session | null> {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    if (s && s.expires_at * 1000 > Date.now()) current = s;
  } catch {
    current = null;
  }
  return current;
}

/**
 * The current session, creating a guest one if the device has none.
 * Never requires an email. Returns null only when the server is unreachable.
 */
export function ensureSession(): Promise<Session | null> {
  if (pending) return pending;
  pending = (async () => {
    const stored = await loadStored();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (stored) headers.Authorization = `Bearer ${stored.access_token}`;
    try {
      // POST returns the caller's session (refreshed) or mints a guest one.
      const res = await fetchPublicApi("/api/public/auth/session", { method: "POST", headers, body: "{}" });
      const body = (await res.json().catch(() => null)) as { session?: Session | null } | null;
      if (res.ok && body?.session) {
        await persist(body.session);
        return body.session;
      }
    } catch {
      // Offline: keep using the stored token.
    }
    return stored;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

export async function getAccessToken(): Promise<string | null> {
  const s = current ?? (await loadStored()) ?? (await ensureSession());
  return s?.access_token ?? null;
}

export type OtpSendResult = { ok: true } | { ok: false; error: string };

export async function sendEmailOtp(rawEmail: string): Promise<OtpSendResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  try {
    const token = await getAccessToken();
    const res = await fetchPublicApi("/api/public/auth/otp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ email }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? "Could not send the code." };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not send the code.",
    };
  }
}

export type OtpVerifyResult = { ok: true; session: Session } | { ok: false; error: string };

export async function verifyEmailOtp(rawEmail: string, token: string): Promise<OtpVerifyResult> {
  const email = rawEmail.trim().toLowerCase();
  const code = token.replace(/\D/g, "");
  if (code.length !== OTP_LENGTH) return { ok: false, error: "Enter the 8-digit code." };
  try {
    const bearer = await getAccessToken();
    const res = await fetchPublicApi("/api/public/auth/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ email, token: code }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; session?: Session }
      | null;
    if (!res.ok || !body?.ok || !body.session) {
      return { ok: false, error: body?.error ?? "Could not verify the code." };
    }
    await persist(body.session);
    return { ok: true, session: body.session };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not verify the code." };
  }
}

/** Drops the email session and starts a fresh guest one (account stays on the server). */
export async function signOut(): Promise<void> {
  await persist(null);
  await ensureSession();
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(current);
  const [loading, setLoading] = useState(!current);

  useEffect(() => {
    let mounted = true;
    listeners.add(setSession);
    void ensureSession().then((s) => {
      if (!mounted) return;
      setSession(s);
      setLoading(false);
    });
    return () => {
      mounted = false;
      listeners.delete(setSession);
    };
  }, []);

  const user: User | null = session?.user ?? null;
  // A guest session counts: Aloya never requires an email.
  return { session, user, loading, signedIn: !!user, hasEmail: !!user?.email };
}
