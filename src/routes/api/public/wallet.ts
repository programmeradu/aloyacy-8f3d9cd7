// Public CORS aggregator for the mobile Wallet.
//
// Bundles every JCC / publictransport call the native wallet needs
// (login, refresh, sync, verify, options) behind a single endpoint so
// the app only has one URL to reason about. Each action is
// server-authored logic ported from `src/lib/jcc.functions.ts` and
// `src/lib/publictransport.functions.ts` — the same upstream contract
// with the same error mapping, exposed to non-web callers.
//
// Auth: none required. The rider provides their own JCC credentials
// per-request. We never persist them.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const JCC = "https://apihub.jcc.com.cy";
const PTC = "https://www.publictransport.com.cy/api/services/app/WebService";

const JCC_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en",
  origin: "https://www.jccsmart.com",
  referer: "https://www.jccsmart.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
} as const;

const PTC_HEADERS = {
  accept: "application/json, text/plain, */*",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  referer: "https://www.publictransport.com.cy/topup/page/topup-travel-card",
} as const;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "600",
} as const;

const cors = (body: unknown, init: number | ResponseInit = 200) =>
  new Response(JSON.stringify(body), {
    ...(typeof init === "number" ? { status: init } : init),
    headers: {
      ...CORS,
      "content-type": "application/json",
      ...(typeof init === "object" && init.headers ? init.headers : {}),
    },
  });

function passwordToCodes(pw: string): number[] {
  return Array.from(pw, (c) => c.charCodeAt(0));
}

function expFromJwt(token: string): number {
  try {
    const [, body] = token.split(".");
    const json = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return typeof json.exp === "number" ? json.exp * 1000 : Date.now() + 30 * 60 * 1000;
  } catch {
    return Date.now() + 30 * 60 * 1000;
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("login"),
    email: z.string().email().max(254),
    password: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("refresh"),
    accessToken: z.string().min(10).max(4000),
    refreshToken: z.string().min(10).max(500),
  }),
  z.object({
    action: z.literal("sync"),
    accessToken: z.string().min(10).max(4000),
    cardUid: z.string().regex(/^\d{6,20}$/),
    period: z.enum(["Today", "Yesterday", "Last7", "Last30"]).default("Last30"),
  }),
  z.object({
    action: z.literal("verify"),
    cardNumber: z.string().regex(/^\d{6,20}$/),
  }),
  z.object({
    action: z.literal("options"),
    cardNumber: z.string().regex(/^\d{6,20}$/),
  }),
]);

type TxField = { name: string; type: string; value: string | number | null };
function pickField(fields: TxField[], name: string): string | number | null {
  return fields.find((f) => f.name === name)?.value ?? null;
}
function flattenEntry(entry: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of entry) if (item && typeof item === "object") Object.assign(out, item);
  return out;
}

async function handleLogin(email: string, password: string) {
  const res = await fetch(`${JCC}/smartauthms/api/v1/Account/Login`, {
    method: "POST",
    headers: { ...JCC_HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ email, password: passwordToCodes(password) }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const isAuth =
      res.status === 401 ||
      res.status === 403 ||
      /errorCode"?:\s*101/.test(text) ||
      /wrong email or password/i.test(text);
    let jccMsg = "";
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j?.message) jccMsg = String(j.message).split("\n")[0];
    } catch { /* noop */ }
    return {
      ok: false as const,
      error: isAuth
        ? "Wrong email or password."
        : jccMsg
          ? `JCC: ${jccMsg}`
          : `JCC login failed (${res.status}).`,
    };
  }
  const body = (await res.json()) as {
    accessToken?: string;
    refreshToken?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  if (!body.accessToken || !body.refreshToken) {
    return { ok: false as const, error: "Login succeeded but no token returned." };
  }
  return {
    ok: true as const,
    tokens: {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAt: expFromJwt(body.accessToken),
    },
    profile: {
      firstName: body.firstName ?? "",
      lastName: body.lastName ?? "",
      email: body.email ?? email,
    },
  };
}

async function handleRefresh(accessToken: string, refreshToken: string) {
  const res = await fetch(`${JCC}/smartauthms/api/v1/Token/Refresh`, {
    method: "POST",
    headers: { ...JCC_HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ accessToken, refreshToken }),
  });
  if (!res.ok) return { ok: false as const, error: "Session expired." };
  const body = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!body.accessToken || !body.refreshToken) {
    return { ok: false as const, error: "Refresh returned no token." };
  }
  return {
    ok: true as const,
    tokens: {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAt: expFromJwt(body.accessToken),
    },
  };
}

async function handleSync(accessToken: string, cardUid: string, period: string) {
  const url =
    `${JCC}/smartms/api/v1/BusFare/Transactions` +
    `?cardUID=${encodeURIComponent(cardUid)}&period=${period}`;
  const res = await fetch(url, {
    headers: { ...JCC_HEADERS, authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { ok: false as const, code: "expired" as const };
  if (res.status === 400) {
    const body = await res.text().catch(() => "");
    const isWrong = /Wrong cardUID/i.test(body);
    let jccMsg = "";
    try {
      const j = JSON.parse(body) as { message?: string };
      if (j?.message) jccMsg = String(j.message).split("\n")[0];
    } catch { /* noop */ }
    return {
      ok: false as const,
      code: "card" as const,
      error: isWrong
        ? "JCC doesn't recognize this card number. Double-check the 10–16 digits on the back."
        : jccMsg
          ? `JCC: ${jccMsg}`
          : `JCC rejected the request (${res.status}).`,
    };
  }
  if (!res.ok) {
    return { ok: false as const, code: "http" as const, error: `JCC sync failed (${res.status}).` };
  }
  const raw = (await res.json()) as Array<{
    date: string;
    price: number;
    stopName: string;
    type: string;
    typeName: string;
    fields: TxField[];
  }>;
  const txs = raw.map((r) => ({
    id: `${r.date}|${r.type}|${r.stopName}`,
    at: r.date,
    type: r.type,
    typeName: r.typeName,
    priceEur: Number(r.price ?? 0),
    balanceEur: Number(pickField(r.fields, "Balance") ?? 0),
    stopName: r.stopName,
    route: String(pickField(r.fields, "Route") ?? ""),
    passName: String(pickField(r.fields, "Name") ?? ""),
  }));
  txs.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  const latest = txs[0];
  return {
    ok: true as const,
    balanceEur: latest ? latest.balanceEur : 0,
    passName: latest?.passName ?? "",
    transactions: txs,
    syncedAt: Date.now(),
  };
}

async function handleVerify(cardNumber: string) {
  const url = `${PTC}/VerifyCard?cardNumber=${encodeURIComponent(cardNumber)}`;
  const res = await fetch(url, { method: "POST", headers: { ...PTC_HEADERS, "content-length": "0" } });
  if (!res.ok) return { ok: false as const, error: `Lookup failed (${res.status}).` };
  const body = (await res.json()) as {
    result?: { balance?: number; cardType?: string | null; result?: string };
    success?: boolean;
  };
  const r = body.result;
  if (!body.success || !r || r.result !== "OK") {
    return { ok: false as const, error: "Card not recognized." };
  }
  return {
    ok: true as const,
    balanceEur: Number(r.balance ?? 0),
    cardType: r.cardType ?? null,
    syncedAt: Date.now(),
  };
}

async function handleOptions(cardNumber: string) {
  const url = `${PTC}/GetCardTopup?cardNumber=${encodeURIComponent(cardNumber)}`;
  const res = await fetch(url, { headers: PTC_HEADERS });
  if (!res.ok) return { ok: false as const, error: `Lookup failed (${res.status}).` };
  const body = (await res.json()) as {
    result?: { balance?: number; cptPassList?: unknown[][]; result?: string };
    success?: boolean;
  };
  const r = body.result;
  if (!body.success || !r || r.result !== "OK") {
    return { ok: false as const, error: "No top-up options for this card." };
  }
  const passes = (r.cptPassList ?? []).flatMap((entry) => {
    const rec = flattenEntry(entry);
    const top = rec.topUpList as
      | { code?: string; name?: string; price?: string; validityPeriods?: string }
      | undefined;
    if (!top) return [];
    const days = top.validityPeriods ? parseInt(top.validityPeriods, 10) : NaN;
    return [{
      code: String(top.code ?? rec.code ?? ""),
      name: String(rec.name ?? top.name ?? ""),
      priceEur: Number(top.price ?? 0),
      validityDays: Number.isFinite(days) ? days : null,
      companyCode: String(rec.companyCode ?? ""),
    }];
  });
  return {
    ok: true as const,
    balanceEur: Number(r.balance ?? 0),
    passes,
    syncedAt: Date.now(),
  };
}

export const Route = createFileRoute("/api/public/wallet")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return cors({ error: "Invalid JSON body." }, 400);
        }
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return cors({ error: "Invalid payload.", issues: parsed.error.flatten() }, 400);
        }
        const data = parsed.data;
        try {
          switch (data.action) {
            case "login":
              return cors(await handleLogin(data.email, data.password));
            case "refresh":
              return cors(await handleRefresh(data.accessToken, data.refreshToken));
            case "sync":
              return cors(await handleSync(data.accessToken, data.cardUid, data.period));
            case "verify":
              return cors(await handleVerify(data.cardNumber));
            case "options":
              return cors(await handleOptions(data.cardNumber));
          }
        } catch (err) {
          return cors(
            { ok: false, error: err instanceof Error ? err.message : "Upstream error." },
            502,
          );
        }
      },
    },
  },
});
