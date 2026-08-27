# aloya-pulse-cron

Cloudflare Worker that fires the app's public hooks.

Secrets are **not** in `wrangler.jsonc` `vars`. After cloning / rotating:

```
wrangler secret put CUSTOM_SUPABASE_SERVICE_ROLE_KEY
wrangler secret put CUSTOM_SUPABASE_ANON_KEY
wrangler secret put CRON_SECRET
```

`fetch()` on this worker (including `?group=archive`) returns 401 if `CRON_SECRET` is unset or wrong.
