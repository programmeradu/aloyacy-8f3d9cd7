// Live ETA share ("watch my trip") for the mobile app, which used to write
// `shared_trips` straight through supabase-js.
//
//   GET  ?token=...                       -> the share row (same columns as
//                                            get_shared_trip_view) or null
//   POST { action: "create", ... }        -> { token, url, writeKey }
//   POST { action: "ping", token, writeKey, lastLat, lastLng, etaMinutes }
//   POST { action: "end",  token, writeKey }
//
// The read token is the public capability in the link. Updates need the
// write key, which only the creating device holds; we store its SHA-256.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getD1 } from "@/lib/db";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { claimsFromRequest } from "@/lib/auth/session.server";

const PUBLIC_BASE = "https://app.aloya.cy";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomToken(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);
const Eta = z.number().int().min(0).max(24 * 60).nullable().optional();
const Token = z.string().min(8).max(200);

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    originLabel: z.string().max(200).nullable().optional(),
    destinationLabel: z.string().min(1).max(200),
    destinationLat: Lat,
    destinationLng: Lng,
    lastLat: Lat.nullable().optional(),
    lastLng: Lng.nullable().optional(),
    etaMinutes: Eta,
  }),
  z.object({
    action: z.literal("ping"),
    token: Token,
    writeKey: Token,
    lastLat: Lat,
    lastLng: Lng,
    etaMinutes: Eta,
  }),
  z.object({ action: z.literal("end"), token: Token, writeKey: Token }),
]);

export const Route = createFileRoute("/api/public/eta-share")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (!Token.safeParse(token).success) return res(400, { error: "missing_token" });
        const { data, error } = await supabaseAdmin.rpc("get_shared_trip_view", { p_token: token });
        if (error) return res(500, { error: "lookup_failed" });
        return res(200, data ?? null);
      },
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return res(400, { error: "invalid_json" });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) return res(400, { error: "invalid_body" });
        const b = parsed.data;
        const db = getD1();
        const now = new Date().toISOString();

        if (b.action === "create") {
          const claims = await claimsFromRequest(request).catch(() => null);
          const writeKey = randomToken(32);
          const hash = await sha256(writeKey);
          for (let attempt = 0; attempt < 3; attempt++) {
            const token = randomToken(22);
            try {
              await db
                .prepare(
                  `INSERT INTO shared_trips (token, owner_id, origin_label, destination_label, destination_lat,
                     destination_lng, last_lat, last_lng, last_updated, eta_minutes, status, write_key_hash)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
                )
                .bind(
                  token,
                  claims?.sub ?? null,
                  b.originLabel ?? null,
                  b.destinationLabel,
                  b.destinationLat,
                  b.destinationLng,
                  b.lastLat ?? null,
                  b.lastLng ?? null,
                  b.lastLat != null && b.lastLng != null ? now : null,
                  b.etaMinutes ?? null,
                  hash,
                )
                .run();
              return res(200, { token, url: `${PUBLIC_BASE}/eta/${token}`, writeKey });
            } catch (e) {
              if (!/UNIQUE/i.test(String((e as Error)?.message))) return res(500, { error: "insert_failed" });
            }
          }
          return res(500, { error: "token_collision" });
        }

        const hash = await sha256(b.writeKey);
        const stmt =
          b.action === "ping"
            ? db
                .prepare(
                  `UPDATE shared_trips SET last_lat = ?, last_lng = ?, last_updated = ?, eta_minutes = ?
                    WHERE token = ? AND write_key_hash = ? AND status = 'active' AND expires_at > ?`,
                )
                .bind(b.lastLat, b.lastLng, now, b.etaMinutes ?? null, b.token, hash, now)
            : db
                .prepare(
                  `UPDATE shared_trips SET status = 'ended', last_updated = ?
                    WHERE token = ? AND write_key_hash = ?`,
                )
                .bind(now, b.token, hash);
        const out = await stmt.run();
        if ((out.meta?.changes ?? 0) === 0) return res(404, { error: "not_found" });
        return res(200, { ok: true });
      },
    },
  },
});
