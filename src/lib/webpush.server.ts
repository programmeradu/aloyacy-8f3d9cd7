// Edge-compatible Web Push sender (RFC 8291 aes128gcm + VAPID).
// Uses only Web Crypto so it works on Cloudflare Workers / workerd.

function b64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  // Normalize: trim whitespace/newlines, strip existing padding, convert b64url → b64
  const clean = input.replace(/\s+/g, "").replace(/=+$/, "");
  const pad = "=".repeat((4 - (clean.length % 4)) % 4);
  const b64 = (clean + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function concat(...arrs: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const buf = new ArrayBuffer(len);
  const out = new Uint8Array(buf);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function utf8(s: string): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder().encode(s);
  const buf = new ArrayBuffer(enc.length);
  const out = new Uint8Array(buf);
  out.set(enc);
  return out;
}

function u16be(n: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(2);
  const v = new Uint8Array(buf);
  v[0] = (n >> 8) & 0xff;
  v[1] = n & 0xff;
  return v;
}

function u32be(n: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(4);
  const v = new Uint8Array(buf);
  v[0] = (n >>> 24) & 0xff;
  v[1] = (n >>> 16) & 0xff;
  v[2] = (n >>> 8) & 0xff;
  v[3] = n & 0xff;
  return v;
}

// ---------- VAPID JWT (ES256) ----------
async function importVapidPrivateKey(privateKeyB64Url: string): Promise<CryptoKey> {
  // Need the public key to construct a JWK. Derive nothing — re-import as raw d
  // with a fixed dummy x,y is impossible; we require the public key too.
  throw new Error("use importVapidKeypair");
}

async function importVapidKeypair(
  publicKeyB64Url: string,
  privateKeyB64Url: string,
): Promise<CryptoKey> {
  const pub = b64urlDecode(publicKeyB64Url);
  if (pub.length !== 65 || pub[0] !== 0x04)
    throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point (base64url).");
  const d = b64urlDecode(privateKeyB64Url);
  if (d.length !== 32) {
    throw new Error(
      `VAPID_PRIVATE_KEY must decode to exactly 32 bytes (got ${d.length}). ` +
        `Use the base64url-encoded raw private scalar (not PEM, not hex, not the JSON keypair).`,
    );
  }
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(x),
    y: b64urlEncode(y),
    d: b64urlEncode(d),
    ext: true,
  };
  try {
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    if (getErrorMessage(error).includes("Invalid EC key in JSON Web Key")) {
      throw new Error(
        "Push notifications are misconfigured: the VAPID public key in src/lib/vapid.ts does not match the VAPID_PRIVATE_KEY secret. Generate a fresh VAPID key pair and update both values together.",
      );
    }
    throw error;
  }
}

async function signVapidJwt(opts: {
  audience: string;
  subject: string;
  publicKey: string;
  privateKey: string;
  expiresInSec?: number;
}): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: opts.audience,
    exp: now + (opts.expiresInSec ?? 12 * 60 * 60),
    sub: opts.subject,
  };
  const enc = (obj: unknown) => b64urlEncode(utf8(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const key = await importVapidKeypair(opts.publicKey, opts.privateKey);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    utf8(unsigned),
  );
  return `${unsigned}.${b64urlEncode(sig)}`;
}

// ---------- HKDF ----------
async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey,
    length * 8,
  );
  const buf = new ArrayBuffer(bits.byteLength);
  const out = new Uint8Array(buf);
  out.set(new Uint8Array(bits));
  return out;
}

// ---------- aes128gcm content encoding (RFC 8188 / 8291) ----------
async function encryptAes128Gcm(opts: {
  payload: Uint8Array<ArrayBuffer>;
  uaPublicKey: Uint8Array<ArrayBuffer>; // 65-byte uncompressed
  uaAuthSecret: Uint8Array<ArrayBuffer>; // 16 bytes
}): Promise<Uint8Array<ArrayBuffer>> {
  // Generate ephemeral ECDH keypair.
  const ephKeypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const exported = await crypto.subtle.exportKey("raw", ephKeypair.publicKey);
  const asPublicRaw = new Uint8Array(new ArrayBuffer(exported.byteLength));
  asPublicRaw.set(new Uint8Array(exported));
  if (asPublicRaw.length !== 65) throw new Error("bad ephemeral pub");

  // Import UA public key.
  const uaPub = await crypto.subtle.importKey(
    "raw",
    opts.uaPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  // ECDH shared secret.
  const ecdhSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPub },
    ephKeypair.privateKey,
    256,
  );
  const ecdhSecret = new Uint8Array(new ArrayBuffer(ecdhSecretBits.byteLength));
  ecdhSecret.set(new Uint8Array(ecdhSecretBits));

  // PRK_key = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_pub || as_pub, 32)
  const keyInfo = concat(utf8("WebPush: info\0"), opts.uaPublicKey, asPublicRaw);
  const ikm = await hkdf(opts.uaAuthSecret, ecdhSecret, keyInfo, 32);

  // Salt (16 random bytes).
  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  // Nonce = HKDF(salt, ikm, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // Plaintext + delimiter (0x02 = last record) padding to fit one record.
  const delim = new Uint8Array(new ArrayBuffer(1));
  delim[0] = 0x02;
  const padded = concat(opts.payload, delim);
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const ctBits = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded);
  const ct = new Uint8Array(new ArrayBuffer(ctBits.byteLength));
  ct.set(new Uint8Array(ctBits));

  // Build the aes128gcm header: salt(16) || rs(4 BE) || idlen(1) || keyid(idlen)
  const rs = padded.length + 16; // include GCM tag
  const idlen = new Uint8Array(new ArrayBuffer(1));
  idlen[0] = asPublicRaw.length;
  const header = concat(salt, u32be(Math.max(rs, ct.length)), idlen, asPublicRaw);
  void u16be;
  return concat(header, ct);
}

// ---------- public send ----------
export type WebPushSubscription = {
  endpoint: string;
  p256dh: string; // base64url
  auth: string; // base64url
};

export type WebPushPayload = Record<string, unknown> & {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

export type SendResult = {
  ok: boolean;
  status: number;
  expired?: boolean;
  error?: string;
};

export async function sendWebPush(opts: {
  subscription: WebPushSubscription;
  payload: WebPushPayload;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string; // mailto: or https URL
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
}): Promise<SendResult> {
  const audience = new URL(opts.subscription.endpoint).origin;
  const jwt = await signVapidJwt({
    audience,
    subject: opts.vapidSubject,
    publicKey: opts.vapidPublicKey,
    privateKey: opts.vapidPrivateKey,
  });

  const body = await encryptAes128Gcm({
    payload: utf8(JSON.stringify(opts.payload)),
    uaPublicKey: b64urlDecode(opts.subscription.p256dh),
    uaAuthSecret: b64urlDecode(opts.subscription.auth),
  });

  const res = await fetch(opts.subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Content-Length": String(body.byteLength),
      TTL: String(opts.ttl ?? 60),
      Urgency: opts.urgency ?? "normal",
      Authorization: `vapid t=${jwt}, k=${opts.vapidPublicKey}`,
    },
    body: body as BodyInit,
  });

  if (res.ok) return { ok: true, status: res.status };
  const expired = res.status === 404 || res.status === 410;
  let text = "";
  try {
    text = await res.text();
  } catch {}
  return { ok: false, status: res.status, expired, error: text || res.statusText };
}
