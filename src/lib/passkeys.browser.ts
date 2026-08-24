import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";

/** Check if current browser & device support Passkeys / platform authenticators */
export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Check if user previously dismissed passkey enrollment on this device */
export function hasDismissedPasskeyPrompt(userId: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(`aloya_pk_dismissed_${userId}`) === "true";
}

/** Record user dismissal */
export function dismissPasskeyPrompt(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`aloya_pk_dismissed_${userId}`, "true");
}

export type PasskeyRegisterResult = { ok: true; deviceName: string } | { ok: false; error: string };

/** Register a new passkey for the current logged-in user */
export async function registerPasskey(
  userId: string,
  userEmail: string,
  getOptionsFn: (args: { data: { origin?: string; userId: string; userEmail: string } }) => Promise<any>,
  verifyFn: (args: { data: { userId: string; response: any; origin?: string; deviceName?: string } }) => Promise<any>,
): Promise<PasskeyRegisterResult> {
  try {
    const origin = window.location.origin;
    const optRes = await getOptionsFn({ data: { origin, userId, userEmail } });
    if (!optRes.ok || !optRes.options) {
      return { ok: false, error: optRes.error || "Failed to initiate passkey setup" };
    }

    const regResponse = await startRegistration({ optionsJSON: optRes.options });

    // Infer friendly device name
    const ua = navigator.userAgent;
    let deviceName = "Passkey";
    if (/iPhone|iPad|iPod/.test(ua)) deviceName = "Apple Device (Face ID/Touch ID)";
    else if (/Macintosh/.test(ua)) deviceName = "Mac (Touch ID)";
    else if (/Android/.test(ua)) deviceName = "Android Biometrics";
    else if (/Windows/.test(ua)) deviceName = "Windows Hello";

    const verifyRes = await verifyFn({
      data: {
        userId,
        response: regResponse,
        origin,
        deviceName,
      },
    });

    if (!verifyRes.ok) {
      return { ok: false, error: verifyRes.error || "Failed to verify passkey" };
    }

    return { ok: true, deviceName: verifyRes.deviceName || deviceName };
  } catch (e) {
    if (e instanceof Error && e.name === "NotAllowedError") {
      return { ok: false, error: "Passkey setup was cancelled." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Passkey setup error" };
  }
}

export type PasskeyAuthResult = { ok: true } | { ok: false; error: string };

/** 1-Tap Sign-In with Passkey */
export async function authenticateWithPasskey(
  getAuthOptionsFn: (args: { data: { origin?: string; email?: string } }) => Promise<any>,
  verifyAuthFn: (args: { data: { challengeKey: string; response: any; origin?: string } }) => Promise<any>,
  email?: string,
): Promise<PasskeyAuthResult> {
  try {
    const origin = window.location.origin;
    const optRes = await getAuthOptionsFn({ data: { origin, email } });
    if (!optRes.ok || !optRes.options) {
      return { ok: false, error: optRes.error || "Failed to start biometric sign-in" };
    }

    const authResponse = await startAuthentication({ optionsJSON: optRes.options });

    const verifyRes = await verifyAuthFn({
      data: {
        challengeKey: optRes.challengeKey,
        response: authResponse,
        origin,
      },
    });

    if (!verifyRes.ok || !verifyRes.email || !verifyRes.token) {
      return { ok: false, error: verifyRes.error || "Biometric authentication failed." };
    }

    // Complete session establishment on Supabase client
    const { error: sessionError } = await supabase.auth.verifyOtp({
      email: verifyRes.email,
      token: verifyRes.token,
      type: "email",
    });

    if (sessionError) {
      return { ok: false, error: sessionError.message };
    }

    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.name === "NotAllowedError") {
      return { ok: false, error: "Biometric sign-in was cancelled." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Passkey sign-in error" };
  }
}
