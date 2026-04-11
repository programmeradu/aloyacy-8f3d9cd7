// Email + 6-digit OTP auth for mobile.
//
// We DO NOT use magic links on device — tapping a link in Mail opens a
// browser, not the app, which breaks the session hand-off. Instead we use
// the same flow as the web AuthSheet: signInWithOtp triggers Lovable's
// branded auth email (rendered via the auth hook webhook) which contains
// the 6-digit {{ .Token }}. The user types it into the app and we verify
// with verifyOtp.

import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type OtpSendResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendEmailOtp(rawEmail: string): Promise<OtpSendResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
