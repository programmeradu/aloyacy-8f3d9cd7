// Server-side proxy for the JCC Smart APIs that power Cyprus Motion cards.
// All calls must go through here because apihub.jcc.com.cy locks CORS to
// jccsmart.com. We never log credentials and never persist them server-side —
// the client holds (access, refresh) tokens in localStorage and re-asks the
// password only when the refresh token has expired.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const API = "https://apihub.jcc.com.cy";
const BROWSER_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en",
  origin: "https://www.jccsmart.com",
  referer: "https://www.jccsmart.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
} as const;

// JCC sends the password as an array of char codes (trivial obfuscation
// over HTTPS — we mirror it so we look like a normal browser session).
function passwordToCodes(pw: string): number[] {
  return Array.from(pw, (c) => c.charCodeAt(0));
}

// Best-effort decode of the JWT `exp` claim. Returns unix ms.
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

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

// ============================================================
// Login
// ============================================================
export const jccLogin = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email().max(254),
      password: z.string().min(1).max(200),
    }).parse,
  )
  .handler(async ({ data }) => {
    const res = await fetch(`${API}/smartauthms/api/v1/Account/Login`, {
      method: "POST",
      headers: { ...BROWSER_HEADERS, "content-type": "application/json" },
      body: JSON.stringify({
        email: data.email,
        password: passwordToCodes(data.password),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // 101 = invalid credentials per JCC's error map.
      const isAuth = res.status === 400 || res.status === 401 || /errorCode"?:\s*101/.test(text);
      return {
        ok: false as const,
        error: isAuth ? "Wrong email or password." : `JCC login failed (${res.status}).`,
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
      } satisfies Tokens,
      profile: {
        firstName: body.firstName ?? "",
        lastName: body.lastName ?? "",
        email: body.email ?? data.email,
      },
    };
  });

// ============================================================
// Refresh access token
// ============================================================
export const jccRefresh = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accessToken: z.string().min(10).max(4000),
      refreshToken: z.string().min(10).max(500),
    }).parse,
  )
  .handler(async ({ data }) => {
    const res = await fetch(`${API}/smartauthms/api/v1/Token/Refresh`, {
      method: "POST",
      headers: { ...BROWSER_HEADERS, "content-type": "application/json" },
      body: JSON.stringify(data),
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
      } satisfies Tokens,
    };
  });

// ============================================================
// Sync — fetch last-30 transactions for a card.
// Derives the current balance from the most recent transaction's Balance field
// (JCC's Status endpoint returns 400 for pass-style cards, so this is the
// canonical source).
// ============================================================
type TxField = { name: string; type: string; value: string | number | null };
export type MotionTx = {
  id: string;
  at: string; // ISO
  type: string; // raw enum (Topup, EntryValidation, ValidationWithActivation, ...)
  typeName: string; // human label from JCC
  priceEur: number;
  balanceEur: number;
  stopName: string;
  route: string;
  passName: string;
};

function pickField(fields: TxField[], name: string): string | number | null {
  return fields.find((f) => f.name === name)?.value ?? null;
}

export const jccSync = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accessToken: z.string().min(10).max(4000),
      cardUid: z.string().regex(/^\d{6,20}$/, "Card UID must be 6-20 digits"),
      period: z.enum(["Today", "Yesterday", "Last7", "Last30"]).default("Last30"),
    }).parse,
  )
  .handler(async ({ data }) => {
    const url =
      `${API}/smartms/api/v1/BusFare/Transactions` +
      `?cardUID=${encodeURIComponent(data.cardUid)}&period=${data.period}`;

    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, authorization: `Bearer ${data.accessToken}` },
    });

    if (res.status === 401) return { ok: false as const, code: "expired" as const };
    if (res.status === 400) {
      const body = await res.text().catch(() => "");
      const isWrong = /Wrong cardUID/i.test(body);
      return {
        ok: false as const,
        code: "card" as const,
        error: isWrong
          ? "JCC doesn't recognize this card number. Double-check the 10–16 digits on the back."
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

    const txs: MotionTx[] = raw.map((r) => ({
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

    // Sort newest-first; latest transaction's Balance is the live balance.
    txs.sort((a, b) => +new Date(b.at) - +new Date(a.at));
    const latest = txs[0];

    return {
      ok: true as const,
      balanceEur: latest ? latest.balanceEur : 0,
      passName: latest?.passName ?? "",
      transactions: txs,
      syncedAt: Date.now(),
    };
  });
