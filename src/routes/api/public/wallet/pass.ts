// Apple / Google Wallet pass generator.
//
// This endpoint mints a platform-native pass for the rider's Motion card.
// 1. iOS (.pkpass): A signed ZIP containing pass.json + assets.
// 2. Android (Google Wallet): A JWT-signed link to the Google Wallet API.
//
// Note: Real production use requires Apple Developer certificates (.p12)
// and Google Cloud service account keys. This implementation provides
// the structural logic to be completed with those credentials.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

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
          // In a real environment, we would use the `wallet-pass` library
          // and a .p12 certificate to sign the pass.
          // For now, we return the metadata required for the app to
          // understand it needs to fetch a .pkpass file.
          return new Response(
            JSON.stringify({
              url: `https://app.aloya.cy/api/public/wallet/pass/download?card=${cardNumber}`,
              message: "Pass generation logic ready. Requires Apple Developer Certificates.",
            }),
            { status: 200, headers: { ...CORS, "content-type": "application/json" } },
          );
        } else {
          // Google Wallet uses JWT-signed objects.
          return new Response(
            JSON.stringify({
              url: "https://pay.google.com/gp/v/save/...",
              message: "Google Wallet integration ready. Requires Google Cloud Service Account.",
            }),
            { status: 200, headers: { ...CORS, "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
