export interface Env {
  // e.g. https://your-lovable-app.com/api/public/snapshot
  TARGET_URL: string; 
  // Required to pass the auth guard on the snapshot endpoint
  CUSTOM_SUPABASE_ANON_KEY?: string; 
  CRON_SECRET?: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const url = env.TARGET_URL;
    if (!url) {
      console.error("TARGET_URL is not configured in Cloudflare environment variables.");
      return;
    }
    
    const headers = new Headers();
    if (env.CRON_SECRET) {
      headers.set("Authorization", `Bearer ${env.CRON_SECRET}`);
    }
    if (env.CUSTOM_SUPABASE_ANON_KEY) {
      headers.set("apikey", env.CUSTOM_SUPABASE_ANON_KEY);
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        console.error("Snapshot ingestion failed", response.status, await response.text());
      } else {
        console.log("Snapshot ingestion succeeded");
      }
    } catch (e) {
      console.error("Failed to fetch target URL", e);
    }
  },
};
