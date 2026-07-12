// Apple / Google Wallet pass generator.
//
// - Android (Google Wallet): mints a signed JWT and returns a
//   https://pay.google.com/gp/v/save/{jwt} link. Requires:
//     GOOGLE_WALLET_ISSUER_ID              — numeric issuer id
//     GOOGLE_WALLET_SERVICE_ACCOUNT_JSON   — full service account JSON string
// - iOS (.pkpass): still stubbed. Real PKCS#7 signing needs Apple certs
//   and isn't practical on Workers — separate task.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignJWT, importPKCS8 } from "jose";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const bodySchema = z.object({
  platform: z.enum(["ios", "android"]),
  cardNumber: z.string().regex(/^\d{6,20}$/),
  holderName: z.string().max(100).optional(),
  tier: z.string().max(50).optional(),
  balance: z.number().optional(),
});

const CLASS_SUFFIX = "aloya_motion_v1";
const ORIGINS = ["https://app.aloya.cy", "https://aloyacy.live", "https://app.aloyacy.live"];

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function parseServiceAccount(raw: string): ServiceAccount {
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) {
    throw new Error("Service account JSON missing client_email or private_key");
  }
  // Handle escaped newlines from env storage
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
}

function buildTransitClass(issuerId: string) {
  return {
    id: `${issuerId}.${CLASS_SUFFIX}`,
    issuerName: "Aloya",
    reviewStatus: "UNDER_REVIEW",
    transitType: "BUS",
    logo: {
      sourceUri: { uri: "https://app.aloya.cy/icon-512.png" },
    },
    hexBackgroundColor: "#1B3A4B",
  };
}

function buildTransitObject(
  issuerId: string,
  cardNumber: string,
  holderName: string | undefined,
  balance: number | undefined,
) {
  const objectId = `${issuerId}.motion_${cardNumber}`;
  return {
    id: objectId,
    classId: `${issuerId}.${CLASS_SUFFIX}`,
    state: "ACTIVE",
    passengerType: "SINGLE_PASSENGER",
    passengerNames: holderName || "Motion Cardholder",
    ticketLeg: {
      transitOperatorName: { defaultValue: { language: "en", value: "Cyprus Motion" } },
    },
    barcode: {
      type: "QR_CODE",
      value: cardNumber,
      alternateText: cardNumber,
    },
    textModulesData: balance !== undefined
      ? [{ header: "Balance", body: `€${balance.toFixed(2)}`, id: "balance" }]
      : [],
  };
}

async function mintGoogleWalletJwt(
  sa: ServiceAccount,
  issuerId: string,
  cardNumber: string,
  holderName: string | undefined,
  balance: number | undefined,
): Promise<string> {
  const key = await importPKCS8(sa.private_key, "RS256");
  const payload = {
    iss: sa.client_email,
    aud: "google",
    typ: "savetowallet",
    origins: ORIGINS,
    payload: {
      transitClasses: [buildTransitClass(issuerId)],
      transitObjects: [buildTransitObject(issuerId, cardNumber, holderName, balance)],
    },
  };
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt()
    .sign(key);
}

export const Route = createFileRoute("/api/public/wallet/pass")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400, headers: CORS });
        }

        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Invalid payload" }), {
            status: 400,
            headers: { ...CORS, "content-type": "application/json" },
          });
        }

        const { platform, cardNumber, holderName, balance } = parsed.data;

        if (platform === "ios") {
          return new Response(
            JSON.stringify({
              url: `https://app.aloya.cy/api/public/wallet/pass/download?card=${cardNumber}`,
              message: "iOS .pkpass generation not yet enabled (requires Apple certs).",
            }),
            { status: 200, headers: { ...CORS, "content-type": "application/json" } },
          );
        }

        // Android — Google Wallet
        const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
        const saJson = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON;
        if (!issuerId || !saJson) {
          return new Response(
            JSON.stringify({ error: "Google Wallet not configured" }),
            { status: 503, headers: { ...CORS, "content-type": "application/json" } },
          );
        }

        try {
          const sa = parseServiceAccount(saJson);
          const jwt = await mintGoogleWalletJwt(sa, issuerId, cardNumber, holderName, balance);
          return new Response(
            JSON.stringify({ url: `https://pay.google.com/gp/v/save/${jwt}` }),
            { status: 200, headers: { ...CORS, "content-type": "application/json" } },
          );
        } catch (err) {
          console.error("[wallet/pass] Google Wallet sign failed", err);
          return new Response(
            JSON.stringify({ error: "Failed to mint wallet pass" }),
            { status: 500, headers: { ...CORS, "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
