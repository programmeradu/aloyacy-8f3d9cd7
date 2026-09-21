// Public endpoint the mobile app uses to request a sign-in code.
//
// The device cannot call supabase.auth.signInWithOtp directly: this project's
// GoTrue send-email hook rejects the send ("Hook requires authorization
// token"), so no code ever leaves. Here we mint and deliver the code with the
// same server-side path the web app uses, then the device verifies it with
// supabase.auth.verifyOtp({ type: "email" }).

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({ email: z.string().email().max(254) });

// Per-email throttle (best effort, per worker instance).
const lastSentAt = new Map<string, number>();
const MIN_INTERVAL_MS = 20_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/auth/otp")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const cfEnv = (request as any)?.runtime?.cloudflare?.env;
        if (cfEnv) {
          const { setWorkerEnv } = await import("@/lib/worker-env");
          setWorkerEnv(cfEnv);
        }

        let email: string;
        try {
          const parsed = BodySchema.parse(await request.json());
          email = parsed.email.trim().toLowerCase();
        } catch {
          return json({ ok: false, error: "Enter a valid email." }, 400);
        }

        const now = Date.now();
        const prev = lastSentAt.get(email) ?? 0;
        if (now - prev < MIN_INTERVAL_MS) {
          const wait = Math.ceil((MIN_INTERVAL_MS - (now - prev)) / 1000);
          return json({
            ok: true,
            throttled: true,
            message: `Code already sent. Try again in ${wait}s.`,
          });
        }
        lastSentAt.set(email, now);

        const { sendAuthOtpEmail } = await import("@/lib/auth-email.server");
        const sent = await sendAuthOtpEmail(email);
        if (!sent.ok) {
          lastSentAt.delete(email);
          return json({ ok: false, error: sent.error }, 502);
        }
        return json({ ok: true, throttled: false });
      },
    },
  },
});
