// Egress proxy for the Cyprus GTFS-RT feed.
//
// The upstream (http://20.19.98.194:8328) answers 403 to Cloudflare Worker
// egress IPs, so our own Worker cannot fetch it directly. This edge function
// runs on different infrastructure and simply relays the raw protobuf bytes.
// It replaces the previously used third-party Vercel proxy.

const UPSTREAM = "http://20.19.98.194:8328/Api/api/gtfs-realtime";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent":
          "Mozilla/5.0 (Aloya/1.0; +https://app.aloya.cy) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `upstream ${upstream.status}` }),
        { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=10",
        ...CORS,
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "fetch failed" }),
      { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
