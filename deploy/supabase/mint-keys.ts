// Mints the anon + service_role API keys for the self-hosted stack.
//
// These are plain HS256 JWTs signed with JWT_SECRET — exactly the shape
// supabase-js expects in the `apikey` header. Run once after choosing a
// JWT_SECRET, then paste the output into deploy/supabase/.env.
//
//   JWT_SECRET="..." bun deploy/supabase/mint-keys.ts
//
// Keep the same JWT_SECRET as the project you're migrating from and every
// signed-in rider keeps their session through the cutover.

import { createHmac } from "node:crypto";

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error(
    "JWT_SECRET is not set. Generate one with:\n  openssl rand -base64 48 | tr -d '\\n'",
  );
  process.exit(1);
}

// Ten years — these are infrastructure keys, not user sessions.
const TEN_YEARS_SEC = 60 * 60 * 24 * 365 * 10;

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(role: "anon" | "service_role"): string {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ role, iss: "supabase", iat, exp: iat + TEN_YEARS_SEC }));
  const body = `${header}.${payload}`;
  const sig = b64url(createHmac("sha256", secret!).update(body).digest());
  return `${body}.${sig}`;
}

const anon = sign("anon");
const service = sign("service_role");

console.log(`ANON_KEY=${anon}\n`);
console.log(`SERVICE_ROLE_KEY=${service}\n`);
console.log("Paste both into deploy/supabase/.env, then set in the app:");
console.log("  CUSTOM_SUPABASE_ANON_KEY          = the ANON_KEY above");
console.log("  VITE_CUSTOM_SUPABASE_ANON_KEY     = the ANON_KEY above");
console.log("  CUSTOM_SUPABASE_SERVICE_ROLE_KEY  = the SERVICE_ROLE_KEY above (server only)");
