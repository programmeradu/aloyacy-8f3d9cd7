import { createServerFn } from "@tanstack/react-start";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { SupabaseClient } from "@/lib/db/compat";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// `user_passkeys` is not in the generated Database types yet; use an untyped
// handle for that table only so the rest of the file keeps full typing.
const passkeyDb = supabaseAdmin as unknown as SupabaseClient;
import { createLogger } from "@/lib/logger";

const log = createLogger("passkeys");

// Relying party configuration
export function getRpConfig(originHeader?: string) {
  const rpName = "Aloya";
  let rpID = "aloya.cy";
  let expectedOrigin = "https://app.aloya.cy";

  if (originHeader) {
    try {
      const url = new URL(originHeader);
      const host = url.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        rpID = host;
        expectedOrigin = originHeader;
      } else if (host.endsWith("aloya.cy")) {
        rpID = "aloya.cy";
        expectedOrigin = url.origin;
      } else if (host.endsWith("lovable.app")) {
        rpID = host;
        expectedOrigin = url.origin;
      }
    } catch {
      // fallback to defaults
    }
  }

  return { rpName, rpID, expectedOrigin };
}

// In-memory challenge store for short-lived challenges (5 minutes TTL)
const challengeStore = new Map<string, { challenge: string; expiresAt: number; userId?: string }>();

function setChallenge(key: string, challenge: string, userId?: string) {
  challengeStore.set(key, {
    challenge,
    userId,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

function getChallenge(key: string): { challenge: string; userId?: string } | null {
  const entry = challengeStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    challengeStore.delete(key);
    return null;
  }
  challengeStore.delete(key);
  return { challenge: entry.challenge, userId: entry.userId };
}

/**
 * 1) Generate Registration Options for an Authenticated User
 */
export const getPasskeyRegistrationOptions = createServerFn({ method: "POST" })
  .validator((data: { origin?: string; userId: string; userEmail: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { rpName, rpID } = getRpConfig(data.origin);

      // Fetch user's existing passkeys to prevent re-registering the same credential
      const { data: existingPasskeys } = await passkeyDb
        .from("user_passkeys")
        .select("credential_id")
        .eq("user_id", data.userId);

      const excludeCredentials = (existingPasskeys || []).map((pk) => ({
        id: pk.credential_id,
        transports: ["internal" as const, "hybrid" as const, "usb" as const, "ble" as const, "nfc" as const],
      }));

      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: new TextEncoder().encode(data.userId),
        userName: data.userEmail,
        userDisplayName: data.userEmail.split("@")[0] || "Aloya Rider",
        attestationType: "none",
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      });

      setChallenge(`reg_${data.userId}`, options.challenge, data.userId);
      return { ok: true as const, options };
    } catch (e) {
      log.error("Failed to generate passkey registration options", e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Registration failed" };
    }
  });

/**
 * 2) Verify Registration Response and Save Passkey to Database
 */
export const verifyPasskeyRegistration = createServerFn({ method: "POST" })
  .validator((data: {
    userId: string;
    response: any;
    origin?: string;
    deviceName?: string;
  }) => data)
  .handler(async ({ data }) => {
    try {
      const saved = getChallenge(`reg_${data.userId}`);
      if (!saved) {
        return { ok: false as const, error: "Registration session expired. Please try again." };
      }

      const { rpID, expectedOrigin } = getRpConfig(data.origin);

      const verification = await verifyRegistrationResponse({
        response: data.response,
        expectedChallenge: saved.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: false,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return { ok: false as const, error: "Passkey verification failed." };
      }

      const { credential, credentialDeviceType } = verification.registrationInfo;

      const credentialID = Buffer.from(credential.id).toString("base64url");
      const publicKey = Buffer.from(credential.publicKey).toString("base64url");

      const deviceName = data.deviceName || (credentialDeviceType === "singleDevice" ? "Platform Passkey" : "Synced Passkey");

      const { error: dbError } = await passkeyDb.from("user_passkeys").insert({
        user_id: data.userId,
        credential_id: credentialID,
        public_key: publicKey,
        counter: credential.counter,
        device_name: deviceName,
        transports: data.response.response.transports || [],
      });

      if (dbError) {
        log.error("Failed to save passkey in database", dbError);
        return { ok: false as const, error: dbError.message };
      }

      log.info("Passkey registered successfully", { userId: data.userId, deviceName });
      return { ok: true as const, deviceName };
    } catch (e) {
      log.error("Error verifying passkey registration", e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Verification error" };
    }
  });

/**
 * 3) Generate Authentication Options (1-Tap Sign-In)
 */
export const getPasskeyAuthOptions = createServerFn({ method: "POST" })
  .validator((data: { origin?: string; email?: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { rpID } = getRpConfig(data.origin);

      let allowCredentials: Array<{ id: string; transports?: any[] }> | undefined;

      if (data.email) {
        // Optional: filter by user's registered credentials if email is provided
        const { data: userProfile } = await passkeyDb
          .from("user_profiles")
          .select("id")
          .eq("email", data.email.trim().toLowerCase())
          .single();

        const profileId = (userProfile as { id?: string } | null)?.id;
        if (profileId) {
          const { data: passkeys } = await passkeyDb
            .from("user_passkeys")
            .select("credential_id, transports")
            .eq("user_id", profileId);

          if (passkeys && passkeys.length > 0) {
            allowCredentials = passkeys.map((p: { credential_id: string; transports?: unknown }) => ({
              id: p.credential_id,
              transports: p.transports as any,
            }));
          }
        }
      }

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: "preferred",
      });

      const challengeKey = `auth_${options.challenge.slice(0, 16)}`;
      setChallenge(challengeKey, options.challenge);

      return { ok: true as const, options, challengeKey };
    } catch (e) {
      log.error("Failed to generate passkey auth options", e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Auth options failed" };
    }
  });

/**
 * 4) Verify Passkey Authentication & Mint Session Token
 */
export const verifyPasskeyAuthentication = createServerFn({ method: "POST" })
  .validator((data: {
    challengeKey: string;
    response: any;
    origin?: string;
  }) => data)
  .handler(async ({ data }) => {
    try {
      const saved = getChallenge(data.challengeKey);
      if (!saved) {
        return { ok: false as const, error: "Sign-in session expired. Please try again." };
      }

      const credentialID = data.response.id;

      // Lookup stored credential
      const { data: passkey, error: pkError } = await passkeyDb
        .from("user_passkeys")
        .select("id, user_id, public_key, counter, credential_id")
        .eq("credential_id", credentialID)
        .single();

      if (pkError || !passkey) {
        return { ok: false as const, error: "Unrecognized Passkey. Please sign in with email OTP." };
      }

      // Fetch user's email from auth.users
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(passkey.user_id);
      if (userError || !userData.user || !userData.user.email) {
        return { ok: false as const, error: "User account not found." };
      }

      const { rpID, expectedOrigin } = getRpConfig(data.origin);

      const verification = await verifyAuthenticationResponse({
        response: data.response,
        expectedChallenge: saved.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        credential: {
          id: passkey.credential_id || credentialID,
          publicKey: Buffer.from(passkey.public_key, "base64url"),
          counter: Number(passkey.counter),
        },
        requireUserVerification: false,
      });

      if (!verification.verified) {
        return { ok: false as const, error: "Biometric authentication failed." };
      }

      // Update counter and last_used_at
      await passkeyDb
        .from("user_passkeys")
        .update({
          counter: verification.authenticationInfo.newCounter,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", passkey.id);

      // Mint a 1-time token to sign in the rider instantly
      const link = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: userData.user.email,
      });

      if (link.error || !link.data.properties?.email_otp) {
        return { ok: false as const, error: "Failed to establish secure session." };
      }

      return {
        ok: true as const,
        email: userData.user.email,
        token: link.data.properties.email_otp,
      };
    } catch (e) {
      log.error("Error verifying passkey authentication", e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Authentication error" };
    }
  });
