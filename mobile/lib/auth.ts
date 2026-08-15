// Email + 6-digit OTP auth for mobile.
//
// We DO NOT use magic links on device — tapping a link in Mail opens a
// browser, not the app, which breaks the session hand-off.
//
// We also don't call supabase.auth.signInWithOtp from the device: this
// project's GoTrue send-email hook refuses the send ("Hook requires
// authorization token"), so the mail never leaves. Instead we ask the same
// server endpoint the web app uses (/api/public/auth/otp) to mint and send
// the branded code, then verify it here with verifyOtp.

import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { fetchPublicApi } from "./api";

export type OtpSendResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendEmailOtp(rawEmail: string): Promise<OtpSendResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  try {
    const res = await fetchPublicApi("/api/public/auth/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
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


export type OtpVerifyResult =
  | { ok: true; session: Session }
  | { ok: false; error: string };

export async function verifyEmailOtp(
  rawEmail: string,
  token: string,
): Promise<OtpVerifyResult> {
  const email = rawEmail.trim().toLowerCase();
  const code = token.replace(/\D/g, "");
  if (code.length < 6) return { ok: false, error: "Enter the 6-digit code." };
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) return { ok: false, error: error.message };
  if (!data.session) return { ok: false, error: "No session returned." };
  return { ok: true, session: data.session };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading, signedIn: !!user };
}
