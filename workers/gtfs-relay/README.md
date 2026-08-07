# Aloya GTFS-realtime relay (Cloudflare Worker)

Self-hosted relay for the Cyprus GTFS-realtime feed, deployable on your own
Cloudflare account.

## Why this exists

The upstream feed is `http://20.19.98.194:8328/Api/api/gtfs-realtime`.
Cloudflare Workers' `fetch()` only dials an allow-list of HTTP ports
(80, 8080, 8880, 2052, 2082, 2086, 2095). Port **8328 is not on that list**, so
the request is refused before it ever leaves Cloudflare — which is what the app
was reporting as a "403 from the upstream".

Raw TCP sockets (`cloudflare:sockets`) have no port restriction, so this Worker
speaks HTTP/1.1 by hand over a socket and returns the raw protobuf bytes.

> The main app already does this internally (`src/lib/gtfs-socket.server.ts`),
> so a separate relay is optional. Deploy this if you want the feed hop on a
> Worker you own and control independently of the app deployment.

## Deploy

```bash
cd workers/gtfs-relay
npx wrangler login          # once, links your Cloudflare account
npx wrangler deploy
```

You'll get a URL like `https://aloya-gtfs-relay.<your-subdomain>.workers.dev`.

Optional — require a bearer token so only the app can call it:

```bash
npx wrangler secret put RELAY_TOKEN
```

## Point the app at it

Add these as secrets on the app (Project Settings → Secrets):

| Secret             | Value                                              |
| ------------------ | -------------------------------------------------- |
| `GTFS_RELAY_URL`   | the deployed Worker URL                             |
| `GTFS_RELAY_TOKEN` | same value as `RELAY_TOKEN` (only if you set one)   |

The app's source order becomes: direct raw-TCP from its own Worker → this
relay → Lovable Cloud relay → plain direct fetch. Any source that fails is
recorded in the diagnostic string, so failures stay legible.

## Verify

```bash
curl -sI https://aloya-gtfs-relay.<your-subdomain>.workers.dev
# 200 + content-type: application/octet-stream  → working
# 502 + message body                            → upstream problem, not Cloudflare
```
