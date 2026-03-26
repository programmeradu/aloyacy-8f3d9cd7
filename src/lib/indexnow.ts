// IndexNow ping — accelerates Bing/Yandex/Seznam indexing.
// Key file is served at https://<host>/<KEY>.txt for verification.
export const INDEXNOW_KEY = "dcf8708ef74e8ed6fe2dd1411eedaf6c";
export const INDEXNOW_HOST = "app.aloya.cy";

// Keep this list in sync with src/routes/sitemap[.]xml.ts
const PATHS = [
  "/",
  "/pulse",
  "/trips",
  "/saved",
  "/wallet",
  "/privacy",
  "/terms",
  "/guide/getting-around-cyprus",
];

export function indexNowPayload(host = INDEXNOW_HOST) {
  return {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
    urlList: PATHS.map((p) => `https://${host}${p}`),
  };
}

export async function pingIndexNow(host = INDEXNOW_HOST): Promise<{
  ok: boolean;
  status: number;
  body?: string;
}> {
  const res = await fetch("https://api.indexnow.org/IndexNow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(indexNowPayload(host)),
  });
  let body: string | undefined;
  try {
    body = await res.text();
  } catch {
    // ignore
  }
  return { ok: res.ok, status: res.status, body };
}
