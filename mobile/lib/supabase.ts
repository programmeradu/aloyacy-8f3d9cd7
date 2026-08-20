// Supabase client for the Aloya mobile app.
//
// Points at whichever backend the build was configured with — the managed
// project today, the self-hosted stack after cutover. Both are reached the
// same way, so switching is a build-time env change, not a code change.
//
// Metro inlines `process.env.EXPO_PUBLIC_*` at build time, but only for
// static dot access — keep these reads written exactly as they are.
//
// Sessions persist via AsyncStorage; URL-based session detection is off
// because RN has no window.location to parse.

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const ENV_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ENV_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Current managed project. Kept as a fallback so existing builds and local
// dev keep working until EXPO_PUBLIC_SUPABASE_* are set in EAS; delete both
// constants once the self-hosted stack is live.
const FALLBACK_SUPABASE_URL = "https://hxtuxxrowwfnwphkdziq.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dHV4eHJvd3dmbndwaGtkemlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NTU2NzIsImV4cCI6MjEwMjIzMTY3Mn0.ruIcdmiUXxiDOjc653DQxr301ke_U6STkYsPu5Ooa-U";

const SUPABASE_URL = (ENV_URL || FALLBACK_SUPABASE_URL).replace(/\/+$/, "");
const SUPABASE_ANON_KEY = ENV_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
