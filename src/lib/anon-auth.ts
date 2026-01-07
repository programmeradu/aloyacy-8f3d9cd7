// Anonymous-first auth bootstrap.
//
// On first launch the rider gets a real Supabase session — but anonymously,
// with no email or password. This unlocks cloud-backed data (motion card,
// saved places, settings, trip history) and Pro entitlement keyed by user_id,
// without ever showing a sign-up wall.
//
// The session JWT persists in localStorage (the default for our supabase
// client), so as long as the rider doesn't clear browser data the same
// anonymous user survives page reloads and PWA reopens.
//
// When the rider later upgrades to Pro, the PaywallSheet calls
// `linkAnonymousAccount` to attach an email/password or Google identity —
// the user_id is preserved, so all their cloud data follows them.

import { supabase } from "@/integrations/supabase/client";

let bootstrapPromise: Promise<void> | null = null;

export function bootstrapAnonymousAuth(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) return; // already signed in (anon or permanent)
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.warn("[anon-auth] sign-in failed:", error.message);
        // Allow retry on next mount if it failed.
        bootstrapPromise = null;
      }
    } catch (err) {
      console.warn("[anon-auth] bootstrap error:", (err as Error).message);
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}

/** True if the current session is an anonymous user (not yet linked). */
export function isAnonymousUser(
  user: { is_anonymous?: boolean; app_metadata?: { provider?: string } } | null,
): boolean {
  if (!user) return false;
  if (user.is_anonymous === true) return true;
  // Fallback: Supabase marks anon users with no provider in app_metadata
  return !user.app_metadata?.provider;
}

/** Promote the current anonymous user to a permanent email/password account. */
export async function linkEmailPassword(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Promote via Google identity link (preserves user_id). */
export async function linkGoogle(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
