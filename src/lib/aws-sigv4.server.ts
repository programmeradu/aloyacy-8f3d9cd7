// Minimal AWS SigV4 signer for Cloudflare Workers / Web Crypto.
// Signs a single POST request. Enough for Bedrock Runtime InvokeModel / Converse.

const enc = new TextEncoder();

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const buf: BufferSource = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return hex(new Uint8Array(hash));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const rawKey: BufferSource =
    key instanceof Uint8Array ? new Uint8Array(key) : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
}


function hex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export interface SigV4Input {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string; // e.g. "bedrock"
  method: string; // "POST"
  url: string; // full URL
  body: string; // request body as string
  headers?: Record<string, string>; // additional headers (Content-Type etc.)
}

export async function signRequest(
  input: SigV4Input,
): Promise<{ url: string; headers: Record<string, string> }> {
  const u = new URL(input.url);
  const host = u.host;
  // Bedrock (and most non-S3 AWS services) requires the path to be URI-encoded
  // TWICE for SigV4. `u.pathname` already contains one layer of encoding from
  // the caller (e.g. ARN colons as %3A); encode each segment once more so
  // "%3A" becomes "%253A" in the canonical request.
  const canonicalUri = u.pathname
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  const canonicalQuery = [...u.searchParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex(input.body);

  const headers: Record<string, string> = {
    "content-type": input.headers?.["Content-Type"] ?? input.headers?.["content-type"] ?? "application/json",
    host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...(input.sessionToken ? { "x-amz-security-token": input.sessionToken } : {}),
    ...Object.fromEntries(
      Object.entries(input.headers ?? {})
        .filter(([k]) => k.toLowerCase() !== "content-type")
        .map(([k, v]) => [k.toLowerCase(), v]),
    ),
  };

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders =
    signedHeaderNames.map((h) => `${h}:${headers[h].trim().replace(/\s+/g, " ")}`).join("\n") + "\n";
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri || "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(enc.encode(`AWS4${input.secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, input.region);
  const kService = await hmac(kRegion, input.service);
  const kSigning = await hmac(kService, "aws4_request");
  const signatureBuf = await hmac(kSigning, stringToSign);
  const signature = hex(new Uint8Array(signatureBuf));

  const authorization = `${algorithm} Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const finalHeaders: Record<string, string> = {
    "Content-Type": headers["content-type"],
    "X-Amz-Date": amzDate,
    "X-Amz-Content-Sha256": payloadHash,
    Authorization: authorization,
  };
  if (input.sessionToken) finalHeaders["X-Amz-Security-Token"] = input.sessionToken;

  return { url: input.url, headers: finalHeaders };
}
